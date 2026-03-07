---
title: "STM32 笔记：SPI 相关"
description: "记录 STM32 SPI 主机模式初始化、GPIO 复用、寄存器读写和 DMA 配置要点。"
pubDate: "2026-03-07"
draft: false
categories:
  - 笔记
  - 嵌入式
tags:
  - STM32
  - SPI
  - DMA
---

## 一、SPI 初始化 / 参数配置

关注DMA里面的某些参数的配置，比如hspi1.Init.DataSize = SPI_DATASIZE_8BIT; 对应了DMA配置的DMA_PDATAALIGN_BYTE，还有就是DMA方向，外设到内存还是内存到外设？ 地址递增还是不变？

注意：hdma_spi1_rx.Init.PeriphInc = DMA_PINC_DISABLE;  因为读和写数据都是从SPI的寄存器来的，所以这个地址不递增。ADC的DMA可以使用这个。

```C
/**
 * @brief SPI1 初始化函数（用于 ICM42688P IMU）
 */
void MX_SPI1_Init(void)
{
    /* 1. 使能 SPI1 与 DMA2 时钟 */
    __HAL_RCC_SPI1_CLK_ENABLE();
    __HAL_RCC_DMA2_CLK_ENABLE();   // SPI1 DMA 使用 DMA2

    hspi1.Instance = SPI1;         // 选择 SPI1 外设

    /* 2. SPI 基本配置 */
    hspi1.Init.Mode = SPI_MODE_MASTER;           // 主机模式
    hspi1.Init.Direction = SPI_DIRECTION_2LINES; // 全双工
    hspi1.Init.DataSize = SPI_DATASIZE_8BIT;     // 8bit 数据 ，决定了PeriphDataAlignment

    /* 3. SPI 时钟模式（ICM42688P: Mode3） */
    hspi1.Init.CLKPolarity = SPI_POLARITY_HIGH;  // CPOL = 1
    hspi1.Init.CLKPhase = SPI_PHASE_2EDGE;       // CPHA = 1

    /* 4. 片选控制 */
    hspi1.Init.NSS = SPI_NSS_SOFT;               // CS 由 GPIO 软件控制

    /* 5. SPI 速度 */
    // SPI1 挂在 APB2，总线时钟 / 8 ≈ 10MHz
    hspi1.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_8;

    /* 6. 数据格式 */
    hspi1.Init.FirstBit = SPI_FIRSTBIT_MSB;      // MSB 先发送

    /* 7. 关闭特殊模式 */
    hspi1.Init.TIMode = SPI_TIMODE_DISABLE;
    hspi1.Init.CRCCalculation = SPI_CRCCALCULATION_DISABLE;

    /* 8. 初始化 SPI */
    if (HAL_SPI_Init(&hspi1) != HAL_OK)
    {
        Error_Handler();
    }

    /* 9. 使能 SPI 外设 */
    //__HAL_SPI_ENABLE(&hspi1);

    /* ================= SPI1 RX DMA ================= */

    /* SPI1_RX -> DMA2_Stream0 Channel 3 */
    hdma_spi1_rx.Instance = DMA2_Stream0;
    hdma_spi1_rx.Init.Channel = DMA_CHANNEL_3;
    hdma_spi1_rx.Init.Direction = DMA_PERIPH_TO_MEMORY; // SPI -> Memory
    hdma_spi1_rx.Init.PeriphInc = DMA_PINC_DISABLE;     // SPI寄存器地址不递增，数据来自用一个SPI寄存器
    hdma_spi1_rx.Init.MemInc = DMA_MINC_ENABLE;         // 内存地址递增
    hdma_spi1_rx.Init.PeriphDataAlignment = DMA_PDATAALIGN_BYTE; //数据宽度，byte 8位
    hdma_spi1_rx.Init.MemDataAlignment = DMA_MDATAALIGN_BYTE;//
    hdma_spi1_rx.Init.Mode = DMA_NORMAL;                // 单次传输，传输一次就停止
    hdma_spi1_rx.Init.Priority = DMA_PRIORITY_MEDIUM;
    hdma_spi1_rx.Init.FIFOMode = DMA_FIFOMODE_DISABLE;  //关FIFO

    if (HAL_DMA_Init(&hdma_spi1_rx) != HAL_OK)
    {
        Error_Handler();
    }

    /* 连接 DMA 到 SPI1 RX */
    __HAL_LINKDMA(&hspi1, hdmarx, hdma_spi1_rx);

    /* DMA 中断 */
    HAL_NVIC_SetPriority(DMA2_Stream0_IRQn, 1, 0);
    HAL_NVIC_EnableIRQ(DMA2_Stream0_IRQn);


    /* ================= SPI1 TX DMA ================= */

    /* SPI1_TX -> DMA2_Stream3 Channel3
       SPI 主机接收数据时，需要 TX 发送 dummy 数据产生时钟 */
    hdma_spi1_tx.Instance = DMA2_Stream3;
    hdma_spi1_tx.Init.Channel = DMA_CHANNEL_3;
    hdma_spi1_tx.Init.Direction = DMA_MEMORY_TO_PERIPH; // Memory -> SPI
    hdma_spi1_tx.Init.PeriphInc = DMA_PINC_DISABLE;
    hdma_spi1_tx.Init.MemInc = DMA_MINC_ENABLE;
    hdma_spi1_tx.Init.PeriphDataAlignment = DMA_PDATAALIGN_BYTE;
    hdma_spi1_tx.Init.MemDataAlignment = DMA_MDATAALIGN_BYTE;
    hdma_spi1_tx.Init.Mode = DMA_NORMAL;
    hdma_spi1_tx.Init.Priority = DMA_PRIORITY_MEDIUM;
    hdma_spi1_tx.Init.FIFOMode = DMA_FIFOMODE_DISABLE;

    if (HAL_DMA_Init(&hdma_spi1_tx) != HAL_OK)
    {
        Error_Handler();
    }

    /* 连接 DMA 到 SPI1 TX */
    __HAL_LINKDMA(&hspi1, hdmatx, hdma_spi1_tx);

    /* DMA 中断 */
    HAL_NVIC_SetPriority(DMA2_Stream3_IRQn, 1, 1);
    HAL_NVIC_EnableIRQ(DMA2_Stream3_IRQn);
}
```

## 二、 GPIO 初始化

和 IIC 一样，SPI 的 GPIO 初始化是在 **HAL_SPI_MspInit()** 里面完成的。

```C
/**
 * @brief SPI1 底层硬件初始化（GPIO + 外设时钟）
 */
void HAL_SPI_MspInit(SPI_HandleTypeDef* hspi)
{
    if (hspi->Instance == SPI1)
    {
        GPIO_InitTypeDef GPIO_InitStruct = {0};

        /* 1. 使能 GPIOA 时钟 */
        __HAL_RCC_GPIOA_CLK_ENABLE();

        /* 2. 配置 SPI1 引脚 */

        // PA5  -> SCK
        // PA6  -> MISO
        // PA7  -> MOSI

        GPIO_InitStruct.Pin = GPIO_PIN_5 | GPIO_PIN_6 | GPIO_PIN_7;
        GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;            // 复用推挽
        GPIO_InitStruct.Pull = GPIO_NOPULL;                // 无上下拉
        GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH; // 高速
        GPIO_InitStruct.Alternate = GPIO_AF5_SPI1;         // 复用 SPI1

        HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
    }
}
```

## 三、SPI的相关操作

1）轮询读写

写：CS拉低，写东西，CS拉高。读

```C
/*轮询读*/
uint8_t icm_spi_read_reg(uint8_t reg)
{
    uint8_t tx[2];
    uint8_t rx[2];
    tx[0] = reg | 0x80;   // bit7 = 1 -> read
    tx[1] = 0xFF;         // dummy
    ICM42688P_CS_LOW();
    HAL_StatusTypeDef status = HAL_SPI_TransmitReceive(&hspi1, tx, rx, 2, HAL_MAX_DELAY);
    ICM42688P_CS_HIGH();
    
    if (status != HAL_OK) {
        printf("[read_reg] HAL_SPI error, status=%d\r\n", status);
        return 0xFF;
    }

    return rx[1];
}
/*轮询写*/
void icm_spi_write_reg(uint8_t reg, uint8_t value)
{
    uint8_t tx[2];
    tx[0] = reg & 0x7F;   // bit7 = 0 -> write
    tx[1] = value;

    ICM42688P_CS_LOW();
    
    // 写操作用轮询模式即可（写不需要接收，开销很小）
    // 且写操作通常在初始化时使用，不是高频操作
    HAL_SPI_Transmit(&hspi1, tx, 2, HAL_MAX_DELAY);
    ICM42688P_CS_HIGH();
}
```



2)如何使用的DMA

INT管脚通过HAL_GPIO_EXTI_Callback（）触发中断后，

先写地址HAL_SPI_Transmit(&hspi1, &addr, 1, 100) ，后开DMA来读HAL_SPI_Receive_DMA(&hspi1, icm_dma_rx_buffer, ICM_DMA_BURST_LEN)
