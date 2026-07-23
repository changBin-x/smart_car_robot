# smartcar_bringup

四轮麦克纳姆小车的模型、控制器配置与启动包。提供 xacro 底盘模型（含 `<ros2_control>` 标签）、`controllers.yaml`（`joint_state_broadcaster` + `mecanum_drive_controller`）、WebSocket 桥接（`rosbridge_server`）、Xbox 手柄遥控（`joy` + `teleop_twist_joy`）以及一键启动的 launch 文件。

- 包类型：`ament_cmake`（纯资源包，无编译产物）
- ROS 版本：ROS 2 Jazzy

## 特性

- **mock / 实机双模式**：launch 参数 `use_mock_hardware` 为 `true` 时用 `mock_components/GenericSystem`（WSL2 无硬件调试），为 `false` 时加载 `motor_driver` 串口插件。
- **几何参数化**：轮半径、前后轮距、左右轮距均为 xacro 参数，实车测量后集中修改。
- **全向运动学 + 里程计**：`mecanum_drive_controller` 解算 4 轮速度并发布 `/odom` 与 `odom → base_footprint` 的 TF。
- **WebSocket 通信桥接**：集成 `rosbridge_server`（`rosbridge_websocket_launch.xml`），提供 9090 端口的 WebSocket 接口，方便 Web 端与小车进行交互。
- **Xbox 手柄遥控控制**：集成 `joy` 与 `teleop_twist_joy` 控制栈，支持左摇杆上下控制前后移动、左摇杆左右控制转弯、右摇杆左右控制左右平移，默认配备 LB 键安全使能与 RB 键加速功能。

## 目录结构

```
smartcar_bringup/
├── urdf/
│   ├── smartcar.urdf.xacro           # 主模型：底盘 + 4 轮
│   └── smartcar.ros2_control.xacro   # ros2_control 硬件宏（mock/实机切换）
├── config/
│   ├── controllers.yaml              # 控制器与运动学参数配置
│   └── xbox_teleop.yaml              # Xbox 手柄摇杆轴与死区比例映射配置
├── launch/
│   ├── smartcar.launch.py            # 一键启动 launch 脚本（含 rosbridge_server 与可选手柄）
│   └── joy_teleop.launch.py          # Xbox 手柄独立遥控 launch 脚本
├── doc/
│   └── 验证手册.md                    # 完整验证步骤与命令
├── CMakeLists.txt
└── package.xml
```

## 快速开始

```bash
# 编译（colcon 工作空间根目录）
colcon build --symlink-install --packages-select smartcar_bringup
source install/setup.bash

# WSL2 mock 仿真（默认 use_mock_hardware:=true，同时启动 rosbridge WebSocket 服务）
ros2 launch smartcar_bringup smartcar.launch.py

# 树莓派实机启动（串口驱动 + MPU6050 + WebSocket 9090）
ros2 launch smartcar_bringup smartcar.launch.py \
  use_mock_hardware:=false serial_port:=/dev/ttyUSB0

# 树莓派实机 + 一键拉起 Xbox 手柄遥控（/dev/input/js0）
ros2 launch smartcar_bringup smartcar.launch.py \
  use_mock_hardware:=false serial_port:=/dev/ttyUSB0 use_joy:=true

# 独立拉起 Xbox 手柄遥控
ros2 launch smartcar_bringup joy_teleop.launch.py joy_dev:=/dev/input/js0
```

## Launch 参数

| 参数名 (Argument) | 默认值 (Default) | 说明 (Description) |
|---|---|---|
| use_mock_hardware | `true` | `true`=mock 仿真；`false`=实机串口驱动 |
| serial_port | `/dev/ttyUSB0` | 实机驱动板串口设备名 |
| baud_rate | `115200` | 串口波特率 |
| use_rviz | `false` | 是否同时打开 RViz2 |
| use_joy | `false` | 是否同时启动 Xbox 手柄遥控栈 |
| joy_dev | `/dev/input/js0` | 手柄 Linux 设备节点路径 |

## Xbox 手柄遥控映射说明

`config/xbox_teleop.yaml` 针对标准 Xbox 手柄（Linux `/dev/input/js0`）进行了优化映射：

- **左摇杆上下 (Axis 1)**：控制前后移动（`linear.x`，推上最大 0.5 m/s，拉下 -0.5 m/s）。
- **左摇杆左右 (Axis 0)**：控制左转 / 右转（`angular.z`，推左最大 1.5 rad/s，推右 -1.5 rad/s）。
- **右摇杆左右 (Axis 3)**：控制左右平移（`linear.y`，推左最大 0.5 m/s，推右 -0.5 m/s）。
- **LB 键 (Button 4)**：安全使能按键（默认必须按住 LB 键遥控才输出指令，若要取消可将 `require_enable_button` 设为 `false`）。
- **RB 键 (Button 5)**：提速 Turbo 按键（按住 RB 键可将限速提升至 1.0 m/s / 3.0 rad/s）。


输出话题已被重映射至 `/mecanum_drive_controller/reference`（消息类型：`geometry_msgs/msg/TwistStamped`）。

## 键盘遥控注意事项

Jazzy 的 `mecanum_drive_controller` 订阅 `geometry_msgs/msg/TwistStamped` 类型的 `/mecanum_drive_controller/reference` 话题，而 `teleop_twist_keyboard` 默认发布不带时间戳的 `Twist`。因此键盘遥控必须加 `stamped:=true` 并 remap 话题：

```bash
ros2 run teleop_twist_keyboard teleop_twist_keyboard \
  --ros-args -p stamped:=true \
  -r /cmd_vel:=/mecanum_drive_controller/reference
```

## 验证

完整验证步骤（控制器状态、8 个状态 + 4 个命令接口、前进/横移/旋转里程计方向）请参考 [验证手册](doc/验证手册.md) 。

## 依赖

- `controller_manager`、`mecanum_drive_controller`、`joint_state_broadcaster`、`battery_state_broadcaster`
- `robot_state_publisher`、`xacro`
- `rosbridge_server`（WebSocket 桥接服务）
- `joy`、`teleop_twist_joy`（Xbox 手柄遥控支持）
- `motor_driver`（实机模式；本仓库同级包）

## 许可证

Apache-2.0（详见 [package.xml](package.xml) ）。
