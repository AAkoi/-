---
title: "低成本电阻网络兼容FPGA D-PHY的简要概括"
description: "详细介绍MIPI CSI接口中D-PHY物理层在7系列FPGA上的兼容性解决方案"
pubDate: "2025-10-01"
categories:
  - 硬件设计
tags:
  - FPGA
  - MIPI
  - D-PHY
  - LVDS
---

***MIPI CSI***作为一种广泛应用于相机的高速串行接口，使用D-PHY作为物理层接口进行物理信号的收发。

本文简述了[1]xapp894在mipi摄像头在7系列兼容性问题。

如下图所示：

相机作为Master，使用==CSI发送器==传输信息（标准为4个数据Lane和1个时钟Lane）。但是在我的项目中使用IMX219和OV5647摄像头（2个数据Lane和1个时钟Lane）。

下方通过IIC或者SCCB协议进行摄像头寄存器配置。

![CSI摄像头框图](/image/blog_mipicsi/CSI摄像头框图.png)

D-PHY：就是一种PHY（**PHYsical Layer**）物理层，负责将数字信号转换为PCB上的电信号进行传输。

它包含了 SLVS (high-speed)差分对 和 LVCMOS (low-power)差分对。

![SLVS电平](/image/blog_mipicsi/SLVS电平.png)

我们关注的是HS（高速模式）下的共模电压V~CMTX~=200mV 和 差模电压|V~OD~|。下面举个简单例子来了解差模、共模和逻辑'1'、'0'：

**状态 A (例如，逻辑 '1'):**

​	V(D+) = Vcm + Vdiff/2 = 200mV + 100mV = **300mV**

​	V(D-) = Vcm - Vdiff/2 = 200mV - 100mV = **100mV**

​	(此时差值 V(D+) - V(D-) = +200mV)

**状态 B (例如，逻辑 '0'):**

​	V(D+) = Vcm - Vdiff/2 = 200mV - 100mV = **100mV**

​	V(D-) = Vcm + Vdiff/2 = 200mV + 100mV = **300mV**

​	(此时差值 V(D+) - V(D-) = -200mV) 

**LVDS：**下面2张图简要描述了LVDS发射端和接收端

作为LVDS发射端，它最上方有VDD，下面跟着一个IS=3.5mA的恒流源，为单线提供了VCCO/2的偏置。

![LVDS发射端](/image/blog_mipicsi/LVDS发射端.png)

接收端就比较简单了，就是一个差分放大器，所以对共模噪声有很强的抑制能力，==但是！！！！！！==输入的信号有一个共模电压范围要求，这个共模电压最小值在使用100欧姆终端电阻的情况下是300mV（见下方图三）

在7系列FPGA的HR bank中可以自己选择开启或者关闭R~TERM~，在HP bank中只能选择外接一个100欧姆或者更高阻值的电阻（后文会讲到，这是兼容的关键！）

![LVDS接收端](/image/blog_mipicsi/LVDS接收端.png)

![LVDS电平](/image/blog_mipicsi/LVDS电平.png)

引用文献中提到：'The LVDS receiver in the FPGA can lower the common mode voltage to 300 mV when using the internal on-die termination resistors. When using external termination resistors, the common mode voltage can drop to 100 mV.'

文中提到当使用外接终端电阻时，可以容忍的共模电压可以降到100mV！！

于是提出可以用外接电阻R9，把LVDS的最小容忍共模电压降到100mV，完美符合SLVS的共模电压为200mV的要求！！这种方法的缺点是单Lane速度只能支持到800Mb/s。

对于我项目中的IMX219和OV5647摄像头，这个速度已经能够流畅支持70fps的1080p画质视频了！！

![低成本电阻网络兼容FPGA_DPHY方法](/image/blog_mipicsi/低成本电阻网络兼容FPGA_DPHY方法.png)

好消息是我刚好有bank13是空闲的，作为摄像头的bank，正好可以使用LVDS_25标准！！

![HR bank LVDS25](/image/blog_mipicsi/HR%20bank%20LVDS25.png)

[1]: https://docs.amd.com/v/u/en-US/xapp894-d-phy-solutions	"xapp894"

