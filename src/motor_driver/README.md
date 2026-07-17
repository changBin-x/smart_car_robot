# motor_driver

四轮麦克纳姆小车的 `ros2_control` 硬件接口插件。实现
`hardware_interface::SystemInterface`，通过 USB 串口（ASCII 协议）与 4 路电机
驱动板通信：`read()` 读取 4 个编码器的位置/速度，`write()` 下发 4 个目标速度。

- 包类型：`ament_cmake`
- 插件类：`motor_driver/MecanumSystemHardware`
- ROS 版本：ROS 2 Jazzy

## 特性

- **三层解耦架构**：硬件接口层、协议层、串口传输层职责分离，协议层可脱离硬件做单元测试。
- **纯 ASCII 协议**：`$spd:...#` 下发速度，`$MAll`/`$MTEP` 解析编码器上报（详见 [协议总结](../../docs/协议总结.md)）。
- **完整生命周期**：`on_init / on_configure / on_activate / on_deactivate / on_cleanup / on_shutdown`。
- **故障容错**：串口打开失败、通信超时、坏帧均返回 `ERROR` 并打日志，不崩溃；`on_deactivate` 与析构时自动发零速停车。
- **参数全部可配**：串口设备名、波特率、编码器线数、减速比等通过 URDF `<param>` 注入，无硬编码。

## 分层架构

```
controller_manager (ros2_control)
     │  每个控制周期调用 read() / write()
     ▼
MecanumSystemHardware   ← 单位换算、生命周期、容错（mecanum_system_hardware.*）
     ▼
protocol                ← ASCII 帧编码/解析，纯逻辑可单测（protocol.*）
     ▼
SerialPort              ← termios 串口读写，带超时不阻塞（serial_port.*）
```

## 导出的接口

| 接口类型 | 数量 | 说明 |
|---|---|---|
| 命令接口 (command) | 4 | 每个轮关节 1 个 `velocity`（单位 rad/s） |
| 状态接口 (state) | 8 | 每个轮关节各 1 个 `position`（rad）+ 1 个 `velocity`（rad/s） |

关节名固定为：`front_left_wheel_joint`、`front_right_wheel_joint`、
`rear_left_wheel_joint`、`rear_right_wheel_joint`。

## URDF 参数

在 URDF 的 `<ros2_control><hardware>` 标签内通过 `<param>` 配置：

| 参数名 (Param) | 类型 (Type) | 默认值 (Default) | 说明 (Description) |
|---|---|---|---|
| serial_port | string | `/dev/ttyUSB0` | 串口设备名 |
| baud_rate | int | 115200 | 波特率 |
| motor_type | int | 2 | 电机类型码（2 = MG310） |
| encoder_lines | int | 13 | 编码器基础线数 L |
| gear_ratio | int | 20 | 减速比 G |
| count_multiplier | int | 1 | 编码器倍频系数 K（1/2/4，实机标定） |
| deadzone | int | 1300 | PWM 死区 |
| wheel_radius | double | 0.03 | 轮半径，单位 m |
| read_timeout_ms | int | 15 | 单次 `read()` 串口等待上限，≤ 20 ms |
| write_timeout_ms | int | 15 | 单次 `write()` 串口等待上限，≤ 20 ms |
| max_read_misses | int | 20 | 连续无有效帧的容忍周期数，超过则报 `ERROR` |
| direction_m1..m4 | double | 1 | 每个电机方向系数，取 `1` 或 `-1` |

> 编码器每转计数 `CPR = encoder_lines × gear_ratio × count_multiplier`。
> 单位换算公式见 [协议总结 §5](../../docs/协议总结.md)。

### 配置示例

```xml
<ros2_control name="smartcar_system" type="system">
  <hardware>
    <plugin>motor_driver/MecanumSystemHardware</plugin>
    <param name="serial_port">/dev/ttyUSB0</param>
    <param name="baud_rate">115200</param>
    <param name="wheel_radius">0.03</param>
    <!-- 其余参数省略，缺省时使用默认值 -->
  </hardware>
  <joint name="front_left_wheel_joint">
    <command_interface name="velocity"/>
    <state_interface name="position"/>
    <state_interface name="velocity"/>
  </joint>
  <!-- 其余 3 个轮关节同理 -->
</ros2_control>
```

## 编译与测试

```bash
# 在 colcon 工作空间根目录
colcon build --symlink-install --packages-select motor_driver
colcon test --packages-select motor_driver
colcon test-result --all
```

协议层单元测试在 `test/test_protocol.cpp`，覆盖指令编码、速度钳位、帧拆分
（半帧/粘连/垃圾字节）与坏帧拒绝，共 17 个用例，无需硬件即可运行。

## 容错行为

| 场景 | 行为 |
|---|---|
| 串口打开失败 | `on_configure` 返回 `ERROR` |
| `read()` 检测到串口错误（如拔线） | 立即返回 `ERROR` |
| 连续 `max_read_misses` 周期无有效帧 | 返回 `ERROR`，视为通信丢失 |
| 坏帧 / 校验失败 | 丢弃该帧并打 `DEBUG` 日志，不影响本周期其余帧 |
| `on_deactivate` / 析构 | 发送 `$spd:0,0,0,0#` 零速停车 |

## 许可证

Apache-2.0（见 package.xml）。
