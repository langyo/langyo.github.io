# Verilog HDL 基础语法 知识点笔记

- 基本概念
Verilog HDL 是一种 HDL (Hardware Description Language, 硬件描述性语言)。使用此类语言可以进行抽象度较高的 RTL (Register Transfer Level, 寄存器传输级)电路设计。RTL 是根据寄存器间的信号流动和电路逻辑来记述电路动作的一种设计模型。

逻辑综合，是将 RTL 级别记述的抽象电路转换到门电路级别的电路网表的过程。逻辑综合时，针对 ASIC (Application Specific Integrated Circult)、FPGA (Field Programmable Gate Array)等不同电路的实现技术，需要使用这些电路相应技术厂商提供的专用目标元件库进行特化生成。
