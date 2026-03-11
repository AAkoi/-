---
title: "UCOSIII 专栏 03：常用 API 速记"
description: " UCOSIII 初始化、任务管理和常见内核接口。"
pubDate: "2026-02-17"
draft: false
categories:
  - 嵌入式
  - UCOSIII专栏
tags:
  - UCOSIII
  - RTOS
  - API
---

==更多请查看==：[官方API文档](https://micrium.atlassian.net/wiki/spaces/osiiidoc/pages/132271/uC-OS-III+API+Reference)

## OS初始化

**OSInit()**

1. `OSInit()` 必须在调用 `OSStart()`之前使用。
2. `OSInit()` 一旦检测到调用的任何子函数出现错误，程序就会立即返回。例如，如果 `OSInit()` 初始化任务管理器时遇到问题，程序将返回相应的错误代码，并且 `OSInit()` 不会继续执行。因此，用户在开始多任务处理之前检查错误代码非常重要。

```C
void main (void)
{
    OS_ERR  err;
    OSInit(&err);                   /* Initialize µC/OS-III              */
    /* Check "err" */

    OSStart(&err);                  /* Start Multitasking                */
    /* Check "err" */               /* Code not supposed to end up here! */

}
```

### 1.初始化全局变量：

包括但不限于

- `OSIntNestingCtr`：中断嵌套计数清零
- `OSRunning`：OS 先标记为“未启动”
- `OSSchedLockNestingCtr`：调度器锁嵌套计数清零
- `OSTCBCurPtr`：当前任务指针置空
- `OSTCBHighRdyPtr`：最高优先级就绪任务指针置空
- `OSPrioCur`：当前优先级清零
- `OSPrioHighRdy`：最高就绪优先级清零
- ......
- OSInitialized = OS_TRUE;   Final：内核已初始化

### 2.初始化各种链表 / 表

- 中断栈初始化：从OSCfg_ISRStkBasePtr开始，初始化中断栈，这个栈与后续创建任务的任务栈不一样
- 优先级位图表初始化：OS_PrioInit(); 就是一个变量为32bits的一个数组，如果数组大小为2，就有64位，表示uC/OS-III 任务优先级有64。==注意**“NVIC 中断优先级”** 和 **“uC/OS-III 任务优先级”**==
- 就绪链表初始化：OS_RdyListInit();

| 栈类型 | 指针                  | 数量        | 用途         |
| ------ | --------------------- | ----------- | ------------ |
| ISR栈  | `OSCfg_ISRStkBasePtr` | 1个         | 所有中断使用 |
| 任务栈 | `p_stk_base`          | 每个任务1个 | 任务运行     |

> [!NOTE]
>
> Cortex-M 有两个栈指针：
> MSP  Main Stack Pointer  → ISR栈
> PSP  Process Stack Pointer → 任务栈
> 任务运行
> 使用 PSP (任务栈)
>
> ↓ 中断发生
>
> 切换 MSP (ISR栈)
>
> ↓ 中断结束
>
> 恢复 PSP (任务栈)

还有这些，就不一一列举了

- `OS_MemInit()`：内存管理结构
- `OS_MsgPoolInit()`：消息池 / 空闲消息链表
- `OS_TLS_Init()`：TLS 表
- `OS_TaskInit()`：任务管理结构
- `OS_TickInit()`：tick/延时管理结构
- `OS_TmrInit()`：软件定时器结构
- `OS_Dbg_Init()`：调试结构
- `OSCfg_Init()`：配置结构

### 3.创建系统任务

- `OS_IdleTaskInit()`：空闲任务      						                优先级：63
- `OS_StatTaskInit()`：统计任务（条件创建）非必须                                优先级：62
- `OS_TmrInit()`：软件定时器模块初始化，通常对应定时器任务/机制     优先级：61



## 任务创建与删除

### [OSTaskCreat](https://micrium.atlassian.net/wiki/spaces/osiiidoc/pages/132273/OSTaskCreate)

 A task cannot be created by an ISR. 不能中断中调用

A task must either be written as an infinite loop, or delete itself once completed. 任务要写成无线循环或者调用后删除

```C
void  OSTaskCreate (OS_TCB        *p_tcb,
                    CPU_CHAR      *p_name,
                    OS_TASK_PTR    p_task,
                    void          *p_arg,
                    OS_PRIO        prio,//任务优先级
                    
    /*是指向任务栈基地址的指针。任务栈用于存储本地变量、函数参数、返回地址，以及中断期间可能的 CPU 寄存器。*/
                    CPU_STK       *p_stk_base,
                    CPU_STK_SIZE   stk_limit,//监控并确保栈不会溢出
                    CPU_STK_SIZE   stk_size,
                    OS_MSG_QTY     q_size, //任务消息队列大小，不用就写0
                    OS_TICK        time_quanta,//时间片长度，不用就写0
                    void          *p_ext, //用户扩展数据指针
                    OS_OPT         opt,//选项 一般就用OS_OPT_TASK_STK_CHK | OS_OPT_TASK_STK_CLR,
                    OS_ERR        *p_err)
```

| 选项                  | 作用           |
| --------------------- | -------------- |
| `OS_OPT_TASK_NONE`    | 无选项         |
| `OS_OPT_TASK_STK_CHK` | 任务栈检查     |
| `OS_OPT_TASK_STK_CLR` | 清空任务栈     |
| `OS_OPT_TASK_SAVE_FP` | 保存浮点寄存器 |
| `OS_OPT_TASK_NO_TLS`  | 不使用 TLS     |

小tips：

`Note that you can allocate stack space for a task from the heap but, in this case, we don’t recommend to ever delete the task and free the stack space as this can cause the heap to fragment, which is not desirable in embedded systems.`
注意，你可以从堆中分配任务栈空间，但在这种情况下，我们不建议删除任务并释放栈空间，因为这可能导致堆碎片化，而这在嵌入式系统中是不理想的。

### OSTaskDEL

```C
void  OSTaskDel (OS_TCB  *p_tcb,
                 OS_ERR  *p_err)
```

使用：

```C
/*删除自己*/
OSTaskDel（（（OS_TCB *）0， &err）
/*删除其他任务的TCB*/
OSTaskDel（&my_task， &err）   
```



## OS启动

==**OSStart()**==

启动 µC/OS-III 下的多任务处理。此函数通常在启动代码中调用，前提是已调用`OSInit()`并创建了至少一个应用程序任务。此函数`OSStart()`不会返回给调用者。µC/OS-III 运行后，`OSStart()`再次调用此函数将无效。

`SInit()`必须在调用之前调用`OSStart()`。`OSStart()`应用程序代码只能调用一次。但是，如果调用`OSStart()`多次，第二次及后续调用将不会产生任何效果

首先获取就绪任务中的最高优先级OS_PrioGetHighest，然后取出该任务控制块的头指针OSRdyList[OSPrioHighRdy].HeadPtr;

之后就调用==OSStartHighRdy()==;  【 See OS_CPU_A.ASM 】

```assembly
.thumb_func
OSStartHighRdy:
    CPSID   I                                                   @ Prevent interruption during context switch
    MOVW    R0, #:lower16:NVIC_SYSPRI14                         @ Set the PendSV exception priority
    MOVT    R0, #:upper16:NVIC_SYSPRI14

    MOVW    R1, #:lower16:NVIC_PENDSV_PRI
    MOVT    R1, #:upper16:NVIC_PENDSV_PRI
    STRB    R1, [R0]
    
 @这个代码的翻译就是  R0=NVIC_SYSPRI14（地址），R1=NVIC_PENDSV_PRI（值），*R0=R1，即把PendSV设定为最低优先级
    

    MOVS    R0, #0                                              @ Set the PSP to 0 for initial context switch call
    MSR     PSP, R0

    MOVW    R0, #:lower16:OS_CPU_ExceptStkBase                  @ Initialize the MSP to the OS_CPU_ExceptStkBase
    MOVT    R0, #:upper16:OS_CPU_ExceptStkBase
    LDR     R1, [R0]
    MSR     MSP, R1

    BL      OSTaskSwHook                                        @ Call OSTaskSwHook() for FPU Push & Pop
    
@解释，PSP=0，R0 =&OS_CPU_ExceptStkBase，R1=*(R0)，MSP = OS_CPU_ExceptStkBase
@将MSP置于异常栈底

    MOVW    R0, #:lower16:OSPrioCur                             @ OSPrioCur   = OSPrioHighRdy;
    MOVT    R0, #:upper16:OSPrioCur
    MOVW    R1, #:lower16:OSPrioHighRdy
    MOVT    R1, #:upper16:OSPrioHighRdy
    LDRB    R2, [R1]
    STRB    R2, [R0]
    
@解释OSPrioCur = OSPrioHighRdy;确定当前最优先任务的优先级

    MOVW    R0, #:lower16:OSTCBCurPtr                           @ OSTCBCurPtr = OSTCBHighRdyPtr;
    MOVT    R0, #:upper16:OSTCBCurPtr
    MOVW    R1, #:lower16:OSTCBHighRdyPtr
    MOVT    R1, #:upper16:OSTCBHighRdyPtr
    LDR     R2, [R1]
    STR     R2, [R0]
    
@解释R2=OSTCBCurPtr = OSTCBHighRdyPtr;把任务指针指向已知的最高优先级的任务

    LDR     R0, [R2]                                            @ R0 is new process SP; SP = OSTCBHighRdyPtr->StkPtr;
    MSR     PSP, R0                                             @ Load PSP with new process SP

    MRS     R0, CONTROL
    ORR     R0, R0, #2
    BIC     R0, R0, #4                                          @ Clear FPCA bit to indicate FPU is not in use
    MSR     CONTROL, R0
    ISB                                                         @ Sync instruction stream

    LDMFD    SP!, {R4-R11, LR}                                  @ Restore r4-11, lr from new process stack
    LDMFD    SP!, {R0-R3}                                       @ Restore r0, r3
    LDMFD    SP!, {R12, LR}                                     @ Load R12 and LR
    LDMFD    SP!, {R1, R2}                                      @ Load PC and discard xPSR
    CPSIE    I
    BX       R1
@解释R0 = OSTCBHighRdyPtr->StkPtr;  PSP = R0;  
@ CONTROL |= 0x2; 线程模式以后使用 PSP
@CONTROL &= ~0x4; 清除 FPCA，表示当前先按“不使用 FPU”处理
```

```markdown
高地址
│
│ xPSR
│ PC
│ LR
│ R12
│ R3
│ R2
│ R1
│ R0
│ R11
│ R10
│ R9
│ R8
│ R7
│ R6
│ R5
│ R4
↓
低地址

SP 现在是 OSTCBHighRdyPtr->StkPtr，然后往上弹赋值给寄存器
```



上面提到MSP=OS_CPU_ExceptStkBase，将MSP置于异常栈底，让所有中断/异常使用专门的异常栈，避免破坏任务栈。

```markdown
          MSP
     ┌────────────┐
     │ 异常栈      │
     │ 中断使用    │
     └────────────┘

          PSP
     ┌────────────┐
     │ 任务A栈     │
     ├────────────┤
     │ 任务B栈     │
     ├────────────┤
     │ 任务C栈     │
     └────────────┘
```



当然有恢复现场也有保存现场。

保存现场的流程为，比如当需要调度的时候，触发pendsv中断，PendSV_Handler()->OS_CPU_PendSVHandler

```assembly
.thumb_func
OS_CPU_PendSVHandler:
    CPSID   I                                                   @ Cortex-M7 errata notice. See Note #5
    MOVW    R2, #:lower16:OS_KA_BASEPRI_Boundary                @ Set BASEPRI priority level required for exception preemption
    MOVT    R2, #:upper16:OS_KA_BASEPRI_Boundary
    LDR     R1, [R2]
    MSR     BASEPRI, R1
    DSB
    ISB
    CPSIE   I

    MRS     R0, PSP                                             @ PSP is process stack pointer
#if (defined(__VFP_FP__) && !defined(__SOFTFP__))
                                                                @ Push high vfp registers if the task is using the FPU context
    TST       R14, #0x10
    IT        EQ
    VSTMDBEQ  R0!, {S16-S31}
#endif

    STMFD   R0!, {R4-R11, R14}                                  @ Save remaining regs r4-11, R14 on process stack

    MOVW    R5, #:lower16:OSTCBCurPtr                           @ OSTCBCurPtr->StkPtr = SP;
    MOVT    R5, #:upper16:OSTCBCurPtr
    LDR     R1, [R5]
    STR     R0, [R1]                                            @ R0 is SP of process being switched out

                                                                @ At this point, entire context of process has been saved
    MOV     R4, LR                                              @ Save LR exc_return value
    BL      OSTaskSwHook                                        @ Call OSTaskSwHook() for FPU Push & Pop

    MOVW    R0, #:lower16:OSPrioCur                             @ OSPrioCur   = OSPrioHighRdy;
    MOVT    R0, #:upper16:OSPrioCur
    MOVW    R1, #:lower16:OSPrioHighRdy
    MOVT    R1, #:upper16:OSPrioHighRdy
    LDRB    R2, [R1]
    STRB    R2, [R0]

    MOVW    R1, #:lower16:OSTCBHighRdyPtr                       @ OSTCBCurPtr = OSTCBHighRdyPtr;
    MOVT    R1, #:upper16:OSTCBHighRdyPtr
    LDR     R2, [R1]
    STR     R2, [R5]

    ORR     LR,  R4, #0x04                                      @ Ensure exception return uses process stack
    LDR     R0, [R2]                                            @ R0 is new process SP; SP = OSTCBHighRdyPtr->StkPtr;
    LDMFD   R0!, {R4-R11, R14}                                  @ Restore r4-11, R14 from new process stack

#if (defined(__VFP_FP__) && !defined(__SOFTFP__))
                                                                @ Pop the high vfp registers if the next task is using the FPU context
    TST       R14, #0x10
    IT        EQ
    VLDMIAEQ  R0!, {S16-S31}
#endif

    MSR     PSP, R0                                             @ Load PSP with new process SP

    MOV     R2, #0                                              @ Restore BASEPRI priority level to 0
    CPSID   I                                                   @ Cortex-M7 errata notice. See Note #5
    MSR     BASEPRI, R2
    DSB
    ISB
    CPSIE   I
    BX      LR                                                  @ Exception return will restore remaining context

.end
```

1. PendSV中断发生时，硬件自动将 xPSR、PC(R15)、LR(R14)、R12、R3-R0 压入当前任务栈（PSP），而 R4-R11 需要在 PendSV_Handler 中由软件手动压栈保存。
2. PendSV_Handler 先保存当前任务的 R4-R11、LR 以及 PSP 到当前任务的 TCB（OSTCBCurPtr->StkPtr），完成旧任务上下文保护，PSP变了，==此时任务栈已经变了==，如果原本是保存的A的任务栈，现在就是该恢复B的任务栈了。
3. 调度器更新当前任务信息：OSPrioCur = OSPrioHighRdy，OSTCBCurPtr = OSTCBHighRdyPtr，确定要运行的新任务。
4. 从新任务 TCB 中取出保存的栈指针（StkPtr），恢复该任务栈中的 R4-R11、LR，并将 PSP 更新为新任务的栈顶。==先手动==
5. 执行 ==BX LR（EXC_RETURN）触发异常返回==，CPU 自动从新任务栈恢复 R0-R3、R12、LR、PC、xPSR，新任务开始运行。==再自动==

> [!IMPORTANT]
>
> **PendSV_Handler 在 MSP 上运行，但任务上下文始终存储在 PSP 上。**



## 临界区

通过 BASEPRI / PRIMASK 屏蔽中断。

必须 **成对使用**， **不支持嵌套**， **临界区必须尽量短**。

原因：关闭中断时间过长，会影响系统实时性

使用场景：保护共享变量，修改OS核心数据结构

```C
CPU_SR_ALLOC();        // 定义中断状态变量

CPU_CRITICAL_ENTER();  // 进入临界区（关中断）

// 关键代码
//.....

CPU_CRITICAL_EXIT();   // 退出临界区（开中断）
```



## 挂起与恢复

`OS_CFG_TASK_SUSPEND_EN` 必须在 `os_cfg.h` 中启用

```C
void   OSTaskSuspend (OS_TCB  *p_tcb,
                      OS_ERR  *p_err)
    
 p_tcb->SuspendCtr++;//内部计数器加加
```

无条件暂停（或阻止）任务的执行。调用任务可以通过 `NULL` 或者 指针 `p_tcb` 来暂停在这种情况下，另一个任务需要恢复被暂停的任务。如果当前任务被暂停，则重新调度，μC/OS-III 会立即运行下一个优先级更高的任务。恢复暂停任务的唯一方法是调用 `OSTaskResume（）。`

OSTaskSuspend() 会无条件挂起指定任务，使其从调度中移除、不再参与运行；若挂起的是当前任务，则会立即触发任务调度切换到其他就绪任务，并且无论优先级多高，该任务都不会再执行，直到被 OSTaskResume() 恢复。

```C
void  OSTaskResume (OS_TCB  *p_tcb,
                    OS_ERR  *p_err)
```

挂起可叠加次数，需要相同次数才能恢复。

**注**：恢复不等于直接插入就绪列表里面，也是要分情况的。

```C
        case OS_TASK_STATE_SUSPENDED:   /*纯挂起态*/
             p_tcb->SuspendCtr--;
             if (p_tcb->SuspendCtr == 0u) {
                 p_tcb->TaskState = OS_TASK_STATE_RDY;
                 OS_RdyListInsert(p_tcb);                       /* Insert the task in the ready list                    */
                 OS_TRACE_TASK_RESUME(p_tcb);
             }
             CPU_CRITICAL_EXIT();
             break;

        case OS_TASK_STATE_DLY_SUSPENDED:  /*挂起+延时*/
             p_tcb->SuspendCtr--;
             if (p_tcb->SuspendCtr == 0u) {
                 p_tcb->TaskState = OS_TASK_STATE_DLY;
             }
             CPU_CRITICAL_EXIT();
             break;

        case OS_TASK_STATE_PEND_SUSPENDED: /*等待事件 + 挂起，比如在等信号量，消息队列*/
             p_tcb->SuspendCtr--;
             if (p_tcb->SuspendCtr == 0u) {
                 p_tcb->TaskState = OS_TASK_STATE_PEND;
             }
             CPU_CRITICAL_EXIT();
             break;

        case OS_TASK_STATE_PEND_TIMEOUT_SUSPENDED:  /*带超时的等待 + 挂起*/
             p_tcb->SuspendCtr--;
             if (p_tcb->SuspendCtr == 0u) {
                 p_tcb->TaskState = OS_TASK_STATE_PEND_TIMEOUT;
             }
             CPU_CRITICAL_EXIT();
             break;

        default:
             CPU_CRITICAL_EXIT();
            *p_err = OS_ERR_STATE_INVALID;
             OS_TRACE_TASK_RESUME_EXIT(OS_ERR_STATE_INVALID);
             break;
```



## 上锁与解锁

当前任务不会被其他任务抢占，但中断可以执行。适用于：任务与任务之间的资源保护。

当调用 OSSchedLock() 锁住调度器后，当前任务不能再调用任何会“阻塞自己”的OS函数，否则系统会卡死。

 `OSSchedLock()` 嵌套深度最多达到 250 层。当 `OSSchedUnlock()` 调用次数达到一定数量时，调度功能将被启用。

```C
/*代码来自官方文档*/
void TaskX (void *p_arg)
{
    OS_ERR  err;
    (void)&p_arg;
    while (DEF_ON) {
        :
        OSSchedLock(&err);     /* Prevent other tasks to run         */
        /* Check "err" */
        :
        :                      /* Code protected from context switch */  
       	/* 操作共享资源 */
        :
        OSSchedUnlock(&err);   /* Enable other tasks to run          */
        /* Check "err" */
        :
        :
    }
}
```

不能使用：因为OSSchedLock()->OS不能切换任务->下列函数（比如OSTimeDly）->把任务挂起->死机

```c
OSTimeDly()
OSSemPend()
OSMutexPend()
OSQPend()
OSFlagPend()
```



## 完整例子一：

- `start_task`：初始化 CPU 库、配置 SysTick 中断及优先级、创建另外三个任务
- `task1`：LED0 每 500ms 闪烁
- `task2`：LED1 每 500ms 闪烁
- `task3`：`KEY0` 挂起 `task1`，`KEY1` 恢复 `task1`

```c
#include  <os.h>
#include  "bsp.h"
#include  "cpu.h"

/* ----------------------- 任务优先级 ----------------------- */
#define  START_TASK_PRIO       3u
#define  TASK1_PRIO            4u
#define  TASK2_PRIO            5u
#define  TASK3_PRIO            6u

/* ----------------------- 任务堆栈大小 ---------------------- */
#define  START_STK_SIZE      128u
#define  TASK1_STK_SIZE      128u
#define  TASK2_STK_SIZE      128u
#define  TASK3_STK_SIZE      128u

/* ----------------------- TCB 和堆栈 ----------------------- */
static  OS_TCB   StartTaskTCB;
static  CPU_STK  StartTaskStk[START_STK_SIZE];

static  OS_TCB   Task1TCB;
static  CPU_STK  Task1Stk[TASK1_STK_SIZE];

static  OS_TCB   Task2TCB;
static  CPU_STK  Task2Stk[TASK2_STK_SIZE];

static  OS_TCB   Task3TCB;
static  CPU_STK  Task3Stk[TASK3_STK_SIZE];

/* ----------------------- 函数声明 ------------------------- */
static  void  start_task(void *p_arg);
static  void  task1(void *p_arg);
static  void  task2(void *p_arg);
static  void  task3(void *p_arg);

/* ----------------------- 主函数 --------------------------- */
int main(void)
{
    OS_ERR err;

    BSP_Init();          /* 板级初始化 */
    CPU_Init();          /* CPU初始化 */

    OSInit(&err);        /* 初始化 uC/OS-III */

    OSTaskCreate((OS_TCB     *)&StartTaskTCB,
                 (CPU_CHAR   *)"start task",
                 (OS_TASK_PTR )start_task,
                 (void       *)0,
                 (OS_PRIO     )START_TASK_PRIO,
                 (CPU_STK    *)&StartTaskStk[0],
                 (CPU_STK_SIZE)START_STK_SIZE / 10u,
                 (CPU_STK_SIZE)START_STK_SIZE,
                 (OS_MSG_QTY  )0u,
                 (OS_TICK     )0u,
                 (void       *)0,
                 (OS_OPT      )(OS_OPT_TASK_STK_CHK | OS_OPT_TASK_STK_CLR),
                 (OS_ERR     *)&err);

    OSStart(&err);       /* 启动多任务 */

    while (1) {
    }
}
```

------

### `start_task`

```C
static void start_task(void *p_arg)
{
    OS_ERR err;

    (void)p_arg;

    CPU_Init();

    /* 配置 SysTick 时钟节拍 */
    OS_CPU_SysTickInit(SystemCoreClock / OSCfg_TickRate_Hz);

    /* 如果你的工程里需要单独设置 SysTick 优先级，也可在这里配 */
    /* 例如：NVIC_SetPriority(SysTick_IRQn, 0); */

    /* 创建 task1 */
    OSTaskCreate((OS_TCB     *)&Task1TCB,
                 (CPU_CHAR   *)"task1",
                 (OS_TASK_PTR )task1,
                 (void       *)0,
                 (OS_PRIO     )TASK1_PRIO,
                 (CPU_STK    *)&Task1Stk[0],
                 (CPU_STK_SIZE)TASK1_STK_SIZE / 10u,
                 (CPU_STK_SIZE)TASK1_STK_SIZE,
                 (OS_MSG_QTY  )0u,
                 (OS_TICK     )0u,
                 (void       *)0,
                 (OS_OPT      )(OS_OPT_TASK_STK_CHK | OS_OPT_TASK_STK_CLR),
                 (OS_ERR     *)&err);

    /* 创建 task2 */
    OSTaskCreate((OS_TCB     *)&Task2TCB,
                 (CPU_CHAR   *)"task2",
                 (OS_TASK_PTR )task2,
                 (void       *)0,
                 (OS_PRIO     )TASK2_PRIO,
                 (CPU_STK    *)&Task2Stk[0],
                 (CPU_STK_SIZE)TASK2_STK_SIZE / 10u,
                 (CPU_STK_SIZE)TASK2_STK_SIZE,
                 (OS_MSG_QTY  )0u,
                 (OS_TICK     )0u,
                 (void       *)0,
                 (OS_OPT      )(OS_OPT_TASK_STK_CHK | OS_OPT_TASK_STK_CLR),
                 (OS_ERR     *)&err);

    /* 创建 task3 */
    OSTaskCreate((OS_TCB     *)&Task3TCB,
                 (CPU_CHAR   *)"task3",
                 (OS_TASK_PTR )task3,
                 (void       *)0,
                 (OS_PRIO     )TASK3_PRIO,
                 (CPU_STK    *)&Task3Stk[0],
                 (CPU_STK_SIZE)TASK3_STK_SIZE / 10u,
                 (CPU_STK_SIZE)TASK3_STK_SIZE,
                 (OS_MSG_QTY  )0u,
                 (OS_TICK     )0u,
                 (void       *)0,
                 (OS_OPT      )(OS_OPT_TASK_STK_CHK | OS_OPT_TASK_STK_CLR),
                 (OS_ERR     *)&err);

    while (1) {
        OSTimeDlyHMSM(0, 0, 1, 0,
                      OS_OPT_TIME_HMSM_STRICT,
                      &err);
    }
}
```

------

### `task1`：LED0 每 500ms 闪烁

```c
static void task1(void *p_arg)
{
    OS_ERR err;

    (void)p_arg;

    while (1) {
        BSP_LED_Toggle(0);    /* LED0翻转 */
        OSTimeDlyHMSM(0, 0, 0, 500,
                      OS_OPT_TIME_HMSM_STRICT,
                      &err);
    }
}
```

------

### `task2`：LED1 每 500ms 闪烁

```C
static void task2(void *p_arg)
{
    OS_ERR err;

    (void)p_arg;

    while (1) {
        BSP_LED_Toggle(1);    /* LED1翻转 */
        OSTimeDlyHMSM(0, 0, 0, 500,
                      OS_OPT_TIME_HMSM_STRICT,
                      &err);
    }
}
```

------

### `task3`：按键控制挂起/恢复 `task1`

```C
static void task3(void *p_arg)
{
    OS_ERR err;

    (void)p_arg;

    while (1) {
        if (BSP_Key_Scan(KEY0) == 1) {
            OSTaskSuspend((OS_TCB *)&Task1TCB, &err);   /* 挂起 task1 */
        }

        if (BSP_Key_Scan(KEY1) == 1) {
            OSTaskResume((OS_TCB *)&Task1TCB, &err);    /* 恢复 task1 */
        }

        OSTimeDlyHMSM(0, 0, 0, 20,
                      OS_OPT_TIME_HMSM_STRICT,
                      &err);
    }
}
```
