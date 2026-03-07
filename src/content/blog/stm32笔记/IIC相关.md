---
title: "STM32 笔记：I2C 相关"
description: "记录 STM32 I2C 的基础初始化、GPIO 开漏配置，以及阻塞和中断方式的寄存器读写。"
pubDate: "2026-03-07"
draft: true
categories:
  - 笔记
  - 嵌入式
tags:
  - STM32
  - I2C
  - 中断
---

## 一、IIC的初始化/参数配置

```c
/**
 * @brief I2C1初始化函数
 */
void MX_I2C1_Init(void)
{
    hi2c1.Instance = I2C1;              // 选择 I2C1 外设

    hi2c1.Init.ClockSpeed = 400000;     // I2C时钟频率（400kHz）
    hi2c1.Init.DutyCycle = I2C_DUTYCYCLE_2; // 快速模式占空比
    hi2c1.Init.OwnAddress1 = 0;         // 本机地址（主机一般不用）从机使用
    hi2c1.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT; // 地址模式：7位  （7位+R/W，这个读或写由hal库完成）
    hi2c1.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE; // 双地址模式关闭
    hi2c1.Init.OwnAddress2 = 0;         // 第二个地址
    hi2c1.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE; // 通用呼叫关闭
    //这个是指的从机可能需要等待时间，从机 会把SCL拉低，打开拉伸允许的话（但是这一般指的32为从机的时候）
    hi2c1.Init.NoStretchMode = I2C_NOSTRETCH_DISABLE; // 时钟拉伸允许

    if (HAL_I2C_Init(&hi2c1) != HAL_OK)
    {
        Error_Handler();                // 初始化失败
    }

    // 开启 I2C1 中断
    //事件中断
    HAL_NVIC_SetPriority(I2C1_EV_IRQn, 5, 0);
    HAL_NVIC_EnableIRQ(I2C1_EV_IRQn);
	//错误中断
    HAL_NVIC_SetPriority(I2C1_ER_IRQn, 5, 0);
    HAL_NVIC_EnableIRQ(I2C1_ER_IRQn);
}
```

## 二、GPIO初始化

这里其实跟uart1_gpio_init相似，都是配置GPIO的外设，AF到IIC，只不过HAL库有个HAL_I2C_MspInit，这个函数在HAL_I2C_Init(I2C_HandleTypeDef *hi2c)函数中，是__weak函数

```C
/**
 * @brief I2C1 底层硬件初始化（GPIO + 外设时钟）
 * @param hi2c I2C句柄
 */
void HAL_I2C_MspInit(I2C_HandleTypeDef *hi2c)
{
    if (hi2c->Instance == I2C1)
    {
        GPIO_InitTypeDef GPIO_InitStruct = {0};

        /* 1. 使能 GPIOB 时钟 */
        __HAL_RCC_GPIOB_CLK_ENABLE();

        /* 2. 使能 I2C1 外设时钟 */
        __HAL_RCC_I2C1_CLK_ENABLE();

        /* 3. 配置 I2C1 SCL 和 SDA 引脚 */
        GPIO_InitStruct.Pin = GPIO_PIN_6 | GPIO_PIN_7;      // PB6=SCL  PB7=SDA
        GPIO_InitStruct.Mode = GPIO_MODE_AF_OD;             // 复用开漏模式
        GPIO_InitStruct.Pull = GPIO_PULLUP;                 // 上拉
        GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;  // 高速
        GPIO_InitStruct.Alternate = GPIO_AF4_I2C1;          // 复用为 I2C1

        HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
    }
}
```

## 三、IIC的相关操作

### 1）轮询读写寄存器

```C
/**
 * @brief 读取单个寄存器
 * @param dev_addr 设备地址（7位地址）
 * @param reg 寄存器地址
 * @return 寄存器值
 */
uint8_t bsp_i2c_read_reg(uint8_t dev_addr, uint8_t reg)
{
    uint8_t value = 0;
    
    // 发送寄存器地址
    HAL_I2C_Master_Transmit(&hi2c1, dev_addr << 1, &reg, 1, time); 
    
    // 读取数据
    HAL_I2C_Master_Receive(&hi2c1, dev_addr << 1, &value, 1, time);
    
    return value;
}

/**
 * @brief 写入单个寄存器
 * @param dev_addr 设备地址（7位地址）
 * @param reg 寄存器地址
 * @param value 要写入的值
 */
void bsp_i2c_write_reg(uint8_t dev_addr, uint8_t reg, uint8_t value)
{
    uint8_t data[2];
    data[0] = reg;
    data[1] = value;
    //|7bit地址|R/W|，其中W写为0，所以直接左移
    HAL_I2C_Master_Transmit(&hi2c1, dev_addr << 1, data, 2, time);
}
```

### 2）中断方式写读

读写完后返回BOOL，但是数据还得等中断后的标志位好了才能执行。HAL_I2C_MasterTxCpltCallback(I2C_HandleTypeDef *hi2c)或是HAL_I2C_MasterRxCpltCallback(I2C_HandleTypeDef *hi2c)整笔TX或RX才调用这个中断函数回调

```C
/**
 * @brief 非阻塞写寄存器（启动传输后立即返回）
 * @param dev_addr 设备地址（7位）
 * @param reg 寄存器地址
 * @param value 要写入的值
 * @return true=启动成功, false=总线忙
 */
bool bsp_i2c_write_reg_start(uint8_t dev_addr, uint8_t reg, uint8_t value)
{
    if (bsp_i2c_is_busy()) {
        return false;
    }
    
    // 清除标志
    i2c1_it_flag = 0;
    
    // 准备数据
    static uint8_t tx_data[2];
    tx_data[0] = reg;
    tx_data[1] = value;
    
    // 启动IT传输
    HAL_StatusTypeDef status = HAL_I2C_Master_Transmit_IT(&hi2c1, dev_addr << 1, tx_data, 2);
    
    return (status == HAL_OK);
}

/**
 * @brief 非阻塞连续读取（启动传输后立即返回）
 * @param dev_addr 设备地址（7位）
 * @param reg 起始寄存器地址
 * @param buffer 数据缓冲区
 * @param len 读取长度
 * @return true=启动成功, false=总线忙
 */
bool bsp_i2c_read_burst_start(uint8_t dev_addr, uint8_t reg, uint8_t *buffer, uint16_t len)
{
    if (bsp_i2c_is_busy()) {
        return false;
    }
    
    // 清除标志
    i2c1_it_flag = 0;
    
    // 先发送寄存器地址（阻塞，很快）
    HAL_StatusTypeDef status = HAL_I2C_Master_Transmit(&hi2c1, dev_addr << 1, &reg, 1, 100);
    if (status != HAL_OK) {
        return false;
    }
    
    // 启动IT接收
    status = HAL_I2C_Master_Receive_IT(&hi2c1, dev_addr << 1, buffer, len);
    
    return (status == HAL_OK);
}
```

