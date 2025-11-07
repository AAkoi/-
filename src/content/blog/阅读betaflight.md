---
title: "阅读Betaflight源码笔记"
description: "简述Betaflight初始化部分"
pubDate: "2025-10-26"
categories:
  - 笔记
tags:
  - Betaflight
  - 飞控
  - 源码分析
---

main就做初始化和 scheduler() 分配任务。

前情提要：

```MD
 common_pre.h、target.h 、common_post.h 三者的关系:
 feature配置都在里面了喵
┌──────────────────┐
│ common_pre.h     │  全局默认配置（第一层）
│ 所有板子都用     │
└────────┬─────────┘
         ↓ (被覆盖)
┌──────────────────┐
│ target.h         │  单个飞控板特定配置（第二层）
│ (STM32F722等)    │
└────────┬─────────┘
         ↓ (被覆盖)
┌──────────────────┐
│ common_post.h    │  最后的调整和默认补充（第三层）
│ 基于前两个文件   │
└──────────────────┘
```

初始化部分：

**文件位置：** `src/main/fc/init.c` 

```c
// init.c 第265行
systemInit();  
// 文件位置：src/main/drivers/stm32/system_stm32f7xx.c (125行)
// ├─ 配置 MPU (内存保护)
// ├─ 配置 NVIC (中断控制)
// ├─ 初始化周期计数器
// └─ 启动 SysTick (系统节拍)

// init.c 第269行
tasksInitData();  
// 文件位置：src/main/fc/tasks.c (465-470行)
// 链接任务实例与任务属性
for (int i = 0; i < TASK_COUNT; i++) {
    tasks[i].attribute = &task_attributes[i];
    // 现在每个 tasks[i] 都知道自己要做什么
}

// init.c 第272-530行
IOInitGlobal();              // 只是构建一个IO使用表，方便集中查找使用的IO和直接调用IO
```

```c
// init.c 第386行
initEEPROM();
//这里的EEPROM是抽象的，可以指的SD，外挂flash，file，片上flash。

//因为我是使用片上的flash，于是无需从外置芯片搬到ram的过程。

//main/target/common_post.c 第574行
#ifndef CONFIG_IN_FLASH
#define CONFIG_IN_FLASH
#endif
extern uint8_t __config_start;   // configured via linker script when building binaries.
extern uint8_t __config_end;     //由链接器填充
#endif

/*
参考stm32_flash_f722.ld  
__config_start = ORIGIN(FLASH_CONFIG);
__config_end = ORIGIN(FLASH_CONFIG) + LENGTH(FLASH_CONFIG);
*/

readEEPROM();
//1.关闭遥感
//->2.loadEEPROM();//加载config，地址是__config_start;__config_end;
//->3.runtimeFeatureMask创建一个特征32位值，快速查看设备的启用，具体看 features_e 这个枚举类型
//->4.验证各项参数是否正确（重要）并激活GPS/pid那些配置    ==todo==后续也会提到
//->5.打开遥感

EXTIInit();//清空中断位/优先级，后续自己开启对应的外设中端
uartPinConfigure();//串口管脚映射
serialInit();//找到能用的串口  pwm/ppm遥控器特殊 ==todo==
/*可选：
buttonsInit();按键
初始Spektrum遥控器
MCO输出时钟
串口反向器 defined(USE_INVERTER) && !defined(SIMULATOR_BUILD)
*/
```

PG系统部分：

**文件位置：** `src/main/pg/pg.h` 

先简单介绍一下 PG 的流程：

```c
// ① 先声明PG配置文件的接口
PG_DECLARE(mixerConfig_t, mixerConfig);
// ② 在某处调用这个宏
PG_REGISTER_WITH_RESET_FN(mixerConfig_t, mixerConfig, PG_MIXER_CONFIG, 1);
// ③ 完善重置函数
void pgResetFn_mixerConfig(mixerConfig_t *mixerConfig)
    
//PG_REGISTER_WITH_RESET_FN宏会把PG_DECLARE和pgResetFn_mixerConfig关联起来，详细请看下方的流程 
```



```c
mixerConfig()->PG_DECLARE(mixerConfig_t, mixerConfig);

// src/main/flight/mixer.h (头文件)
PG_DECLARE(mixerConfig_t, mixerConfig);
      ↑
    这个宏在头文件中声明了接口

```

```c
//将上方宏展开结果：
extern mixerConfig_t mixerConfig_System;      // 声明
extern mixerConfig_t mixerConfig_Copy;        // 声明

// ← 关键：生成访问函数
static inline const mixerConfig_t* mixerConfig(void) 
{ 
    return &mixerConfig_System;  // 指向实际的参数变量
}

static inline mixerConfig_t* mixerConfigMutable(void) 
{ 
    return &mixerConfig_System; 
}
```

```c
// src/main/flight/mixer_init.c (源文件)

PG_REGISTER_WITH_RESET_FN(mixerConfig_t, mixerConfig, PG_MIXER_CONFIG, 1);

void pgResetFn_mixerConfig(mixerConfig_t *mixerConfig)
{
    mixerConfig->mixerMode = DEFAULT_MIXER;  // ← MIXER_QUADX
    // ... 其他初始化
}
```

```c
//PG_REGISTER_WITH_RESET_FN宏展开：
// ① 定义实际的变量
mixerConfig_t mixerConfig_System;    // ← 存储当前配置
mixerConfig_t mixerConfig_Copy;      // ← 存储备份
uint32_t mixerConfig_fnv_hash;       // ← 校验和

// ② 创建注册表
const pgRegistry_t mixerConfig_Registry = {
    .pgn = PG_MIXER_CONFIG | (1 << 12),
    .length = 1,
    .size = sizeof(mixerConfig_t),
    .address = (uint8_t*)&mixerConfig_System,     // ← 关键指针！
    .copy = (uint8_t*)&mixerConfig_Copy,
    .ptr = 0,
    .reset = {.fn = (pgResetFunc*)&pgResetFn_mixerConfig},  // ← 关键函数！
    .fnv_hash = &mixerConfig_fnv_hash,
};

// ③ 重置函数
void pgResetFn_mixerConfig(mixerConfig_t *mixerConfig)
{
    // mixerConfig 指向 mixerConfig_System
    mixerConfig->mixerMode = DEFAULT_MIXER;
}
```

还记得 `systemInit()` 吗，比较重要的就是`readEEPROM()`，其中的load数据操作如下，比如==第一次烧录==代码的时候，会遍历一遍，因为这个宏`PG_REGISTER_ATTRIBUTES`遍历的起始地址由编译器填充，

调用`pgReset(reg);`对每个PG参数挨着进行初始化，使用`pgRegistry_t`这个注册表里面的数据。

```c
bool loadEEPROM(void)
{
    bool success = true;

    PG_FOREACH(reg) {
        const configRecord_t *rec = findEEPROM(reg, CR_CLASSICATION_SYSTEM);
        if (rec) {
            // config from EEPROM is available, use it to initialize PG. pgLoad will handle version mismatch
            if (!pgLoad(reg, rec->pg, rec->size - offsetof(configRecord_t, pg), rec->version)) {
                success = false;
            }
        } else {
            pgReset(reg);

            success = false;
        }
        *reg->fnv_hash = fnv_update(FNV_OFFSET_BASIS, reg->address, pgSize(reg));
    }

    return success;
}
```



好了，回到main函数的初始化的流程来。我们就知道了：`mixerInit(mixerConfig()->mixerMode);`中的参数原来是经过① 先声明PG配置文件的接口 ② 在某处调用这个宏 ③ 重置函数 这3个步骤，完成了 `mixerConfig->mixerMode = DEFAULT_MIXER;`当然模式默认为4轴。

```c
PG_REGISTER_WITH_RESET_FN(mixerConfig_t, mixerConfig, PG_MIXER_CONFIG, 1);

void pgResetFn_mixerConfig(mixerConfig_t *mixerConfig)
{
    mixerConfig->mixerMode = DEFAULT_MIXER;
    mixerConfig->yaw_motors_reversed = false;
    mixerConfig->crashflip_motor_percent = 0;
    mixerConfig->crashflip_expo = 35;
    mixerConfig->mixer_type = MIXER_LEGACY;
#ifdef USE_RPM_LIMIT
    mixerConfig->rpm_limit = false;
    mixerConfig->rpm_limit_p = 25;
    mixerConfig->rpm_limit_i = 10;
    mixerConfig->rpm_limit_d = 8;
    mixerConfig->rpm_limit_value = 18000;
#endif
}
```

除了使用函数赋值，还可以使用模板来赋值

| 特性       | FUNCTION方式               | TEMPLATE方式                    |
| :--------- | :------------------------- | :------------------------------ |
| 宏名       | PG_REGISTER_WITH_RESET_FN  | PG_REGISTER_WITH_RESET_TEMPLATE |
| reset字段  | .reset = {.fn = 函数指针}  | .reset = {.ptr = 数据指针}      |
| 初始值定义 | void pgResetFn_xxx(type *) | PG_RESET_TEMPLATE(...)          |

例如：

```c
currentPidProfile = pidProfilesMutable(systemConfig()->pidProfileIndex);

// ① 先声明PG配置文件的接口
PG_DECLARE(systemConfig_t, systemConfig);

// ② 在调用这个宏 PG_RESET_TEMPLATE
PG_RESET_TEMPLATE(systemConfig_t, systemConfig,
	...
);
//就不用自己写一个reset函数了
```

继续回来，`mixerInit`也就把mixer矩阵放到了ram中，等待后续使用，`USE_LAUNCH_CONTROL`如果使用了启动控制，mixer矩阵会在启动时发生一定变化，比如禁用某几个电机。

==todo==去了解一下mixer的物理原理

```c
选择驱动程序的流程图：

                        motorDevInit()
                             ↓
                    isMotorProtocolEnabled()?
                    ↙ YES                ↘ NO
                   ↓                      ↓
        isMotorProtocolDshot()?      motorNullDevice
        ↙ NO              ↘ YES       (什么都不做)
       ↓                  ↓
  motorPwmDevInit()   isDshotBitbangActive()?
  (普通PWM协议)        ↙ YES          ↘ NO
  ├─ Standard         ↓               ↓
  ├─ OneShot          dshotBitbang  dshotPwmDevInit
  ├─ MultiShot        DevInit       (硬件定时器)
  └─ Brushed          (软件模拟)

结果：
motorDevice 指向选中的驱动程序的虚函数表 (vTable)
    
之后systemState |= SYSTEM_STATE_MOTORS_READY;状态更新
```



后续为初始化beeper，再次运用PG系统，再梳理一遍，后续再遇到PG就跳过了！

```C
beeperInit(beeperDevConfig());
               ↓
           PG_DECLARE(beeperDevConfig_t, beeperDevConfig);
				↓
			PG_REGISTER_WITH_RESET_TEMPLATE(beeperDevConfig_t, beeperDevConfig, PG_BEEPER_DEV_CONFIG, 0);
				↓即可通过 config->（xxx）取数据了

```



接下来初始化总线：根据USE_SPI，USE_QUADSPI，USE_OCTOSPI来初始化spi，这属于板子的feature。



==TODO== MSC 的初始化

```MD
启动飞控板
  ↓
检测USB/按钮（进入MSC模式？）
  ↓
┌─── 是 ──→ 初始化Flash → 启用DMA → 启动USB → 等待用户按按钮
│           ↓
│       虚拟文件系统就绪
│       电脑可以访问日志
│
└─── 否 ──→ 清除RTC时间戳 → 继续正常启动
           返回飞行模式
```



```C
initBoardAlignment(boardAlignment());  //把eeprom里面的板子倾斜数据进行坐标系的转换
                                       //可以在地面站设置，默认3轴都为0
/*流程如下：
【飞控启动】
    ↓
【1】读取PG_RESET_TEMPLATE的默认值
    boardAlignment.rollDegrees = DEFAULT_ALIGN_BOARD_ROLL (=0)
    boardAlignment.pitchDegrees = DEFAULT_ALIGN_BOARD_PITCH (=0)
    boardAlignment.yawDegrees = DEFAULT_ALIGN_BOARD_YAW (=0)
    ↓
【2】从EEPROM加载用户保存的值（覆盖默认值）
    IF (EEPROM中有用户配置):
        boardAlignment.rollDegrees = 10   ← 用户在地面站设置的
        boardAlignment.pitchDegrees = 5   ← 用户在地面站设置的
        boardAlignment.yawDegrees = 0     ← 用户在地面站设置的
    ↓
【3】使用最终的配置值
    initBoardAlignment(boardAlignment);  ← 使用从EEPROM加载的值
    
喵喵喵*/

sensorsAutodetect() //初始化物理传感器：陀螺仪，加速器，罗盘，磁力计，测距器，内部adc
   
systemState |= SYSTEM_STATE_SENSORS_READY;//记录状态 
```

==TODO==这2个函数包括了一些pid时间的设置和滤波器的一些设置，检测电调协议，加载pid配置，初始化dshot，滤波器，pid，mixer

```C
    // Set the targetLooptime based on the detected gyro sampleRateHz and pid_process_denom
    gyroSetTargetLooptime(pidConfig()->pid_process_denom);

    // Validate and correct the gyro config or PID loop time if needed
    validateAndFixGyroConfig();

    // Now reset the targetLooptime as it's possible for the validation to change the pid_process_denom
    gyroSetTargetLooptime(pidConfig()->pid_process_denom);

//----------------------------------------------

#if defined(USE_DSHOT_TELEMETRY) || defined(USE_ESC_SENSOR)
    // Initialize the motor frequency filter now that we have a target looptime
    initDshotTelemetry(gyro.targetLooptime);
#endif

    // Finally initialize the gyro filtering
    gyroInitFilters();

    pidInit(currentPidProfile);

    mixerInitProfile();
```

==TODO==后续为：

```C
imuInit();//初始化算法层面的传感器，形成特殊矩阵，后续讲解

failsafeInit();//初始化故障状态 todo：什么时候会改变故障状态

rxInit();//初始化接收机（根据feature），初始化遥感，关闭开关
```

接着为一系列初始化，大差不差，列一个大纲出来，只讨论一些重要的点：

==TODO== 遥控接收  VTX图传  MSP通信  传感器校准

```MD
✅ 电池管理 (batteryInit)
✅ 遥控接收 (rxInit)
✅ VTX图传 (vtxControlInit / vtxCommonInit)
✅ OSD屏幕 (osdInit / max7456DisplayPortInit)
✅ MSP通信 (mspInit)
✅ 黑匣子 (blackboxInit)
✅ 电机PWM (motorPostInit / motorEnable)
✅ 传感器校准 (gyroStartCalibration)
✅ SPI DMA (spiInitBusDMA)
✅ 任务调度 (tasksInit)

⚠️ LED灯条 (ledStripInit) - 装饰效果
⚠️ ESC传感器 (escSensorInit) - 温度监测
⚠️ SmartAudio (vtxSmartAudioInit) - VTX遥控调节
⚠️ 遥测 (telemetryInit) - 实时数据

❌ GPS (gpsInit)
❌ SD卡 (sdCardAndFSInit) - 一般FC没有SD卡槽
❌ 仪表盘 (dashboardInit) - 需要额外OLED屏幕
```

下期的重点为tasksInit，也就是main函数的scheduler()部分。
