---
title: "STM32 笔记：PWM"
description: "记录 STM32 定时器 PWM 的频率计算、GPIO 复用、通道启动与占空比控制。"
pubDate: "2026-03-07"
draft: false
categories:
  - 笔记
  - 嵌入式
tags:
  - STM32
  - PWM
  - TIM
---

1 配置PSC和ARR → 确定PWM频率
2 配置GPIO AF → 让PWM输出到引脚
3 配置PWM模式 → HAL_TIM_PWM_ConfigChannel
4 修改CCR → 控制占空比

## 一、PWM初始化

PWM频率 = 定时器时钟 / ((PSC + 1) * (ARR + 1))

首先你先给定一个PWM_TICK_HZ为1M，让PWM的原本时钟降到如84M降到1M，这样就需要预分频器，然后再来一个自动重装值 ARR就可以实现高低电平翻转了，注意不同定时器的时钟树不同。

```C
/**
 * @brief PWM定时器初始化
 * @param htim 定时器句柄
 * @param instance 定时器实例 (TIM3 / TIM8)
 * @param pwm_hz PWM频率
 */
static bool pwm_setup_timer(TIM_HandleTypeDef *htim, TIM_TypeDef *instance, uint32_t pwm_hz)
{
    uint32_t tim_clk = timer_get_clock(instance);
    if (tim_clk == 0U || pwm_hz == 0U) {
        return false;
    }

    htim->Instance = instance;

    /* 计算预分频器 */
    uint32_t prescaler = tim_clk / PWM_TICK_HZ;
    if (prescaler == 0U) prescaler = 1U;

    /* 计算自动重装值 ARR */
    uint32_t period = PWM_TICK_HZ / pwm_hz;
    if (period < 2U) period = 2U;

    htim->Init.Prescaler = prescaler - 1U;      // 预分频器
    htim->Init.CounterMode = TIM_COUNTERMODE_UP;// 向上计数
    htim->Init.Period = period - 1U;            // 自动重装值
    htim->Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
    htim->Init.RepetitionCounter = 0;
    htim->Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;//修改ARR后周期不会突然改变，会在下个周期变化
    /* 初始化PWM定时器 */
    return (HAL_TIM_PWM_Init(htim) == HAL_OK);
}
```

## 二、GPIO初始化

PWM输出必须把GPIO配置为 **定时器复用功能(AF)**。

```C
/**
 * @brief PWM GPIO初始化
 */
static void pwm_gpio_init(void)
{
    __HAL_RCC_GPIOC_CLK_ENABLE();
    __HAL_RCC_GPIOB_CLK_ENABLE();

    GPIO_InitTypeDef GPIO_InitStruct = {0};
    GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;     // 复用推挽
    GPIO_InitStruct.Pull = GPIO_NOPULL;         // 无上下拉
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_HIGH;

    /* TIM3_CH3 - PC8 */
    GPIO_InitStruct.Pin = timer3_ch3;
    GPIO_InitStruct.Alternate = GPIO_AF2_TIM3;
    HAL_GPIO_Init(timer_port, &GPIO_InitStruct);

    /* TIM3_CH4 - PB1 */
    GPIO_InitStruct.Pin = timer3_ch4;
    GPIO_InitStruct.Alternate = GPIO_AF2_TIM3;
    HAL_GPIO_Init(timer_port1, &GPIO_InitStruct);

    /* TIM8_CH1/CH2 - PC6/PC7 */
    GPIO_InitStruct.Pin = timer8_ch1 | timer8_ch2;
    GPIO_InitStruct.Alternate = GPIO_AF3_TIM8;
    HAL_GPIO_Init(timer_port, &GPIO_InitStruct);
}
```

## 三、PWM相关操作

### 1）PWM通道配置 + 启动

配置PWM模式并启动输出：

```C
/**
 * @brief 配置PWM通道并启动
 */
static bool pwm_config_and_start(TIM_HandleTypeDef *htim, uint32_t channel)
{
    TIM_OC_InitTypeDef sConfigOC = {0};

    sConfigOC.OCMode = TIM_OCMODE_PWM1;        // PWM1模式，输出比较模式
    sConfigOC.Pulse = 0;                       // 初始占空比0
    sConfigOC.OCPolarity = TIM_OCPOLARITY_HIGH;// 高电平有效
    sConfigOC.OCFastMode = TIM_OCFAST_DISABLE;//关闭 PWM 快速模式

    /* 配置PWM通道 */
    if (HAL_TIM_PWM_ConfigChannel(htim, &sConfigOC, channel) != HAL_OK) {
        return false;
    }

    /* 启动PWM输出 */
    if (HAL_TIM_PWM_Start(htim, channel) != HAL_OK) {
        return false;
    }

    return true;
}
```

### 2）设置PWM占空比

修改占空比实际上是 **修改 CCR寄存器**。

```C
/**
 * @brief 设置PWM占空比
 * @param ch PWM通道
 * @param duty 占空比 (0.0 ~ 1.0)
 */
void bsp_pwm_write(bsp_pwm_channel_t ch, float duty)
{
    if (!pwm_ready || ch >= BSP_PWM_CH_MAX) {
        return;
    }

    TIM_HandleTypeDef *htim = pwm_map[ch].htim;

    float v = clampf(duty, 0.0f, 1.0f);//限幅0-1

    uint32_t arr = __HAL_TIM_GET_AUTORELOAD(htim);//获取重装载值

    uint32_t pulse = (uint32_t)((float)(arr + 1U) * v + 0.5f);

    if (pulse > arr) pulse = arr;
	//该函数就是在配置CCR寄存器，把pulse赋值给CCR，其中占空比=CCR/（AAR+1）
    __HAL_TIM_SET_COMPARE(htim, pwm_map[ch].channel, pulse); 
}
```

