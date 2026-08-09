# smartcar_bringup

四轮麦克纳姆小车的模型、控制器配置与启动包。提供 xacro 底盘模型（含 `<ros2_control>` 标签）、`controllers.yaml`（`joint_state_broadcaster` + `mecanum_drive_controller`）、可选 `robot_localization` EKF 融合、WebSocket 桥接（`rosbridge_server`）、Xbox 手柄遥控（`joy` + `joystick_teleop`）以及一键启动的 launch 文件。

- 包类型：`ament_cmake`（纯资源包，无编译产物）
- ROS 版本：ROS 2 Jazzy

## 特性

- **mock / 实机双模式**：launch 参数 `use_mock_hardware` 为 `true` 时用 `mock_components/GenericSystem`（WSL2 无硬件调试），为 `false` 时加载 `motor_driver` 串口插件。
- **几何参数化**：轮半径、前后轮距、左右轮距均为 xacro 参数，实车测量后集中修改。
- **全向运动学 + 原始里程计**：`mecanum_drive_controller` 解算 4 轮速度并发布 `/mecanum_drive_controller/odometry`；`enable_odom_tf=false`，不发布最终里程计动态 TF。
- **里程计 / IMU 融合**：显式 `use_ekf:=true` 时启动 `ekf_filter_node_odom`，融合轮速里程计速度量与 `/imu/data_raw`，输出 `/odometry/filtered` 并发布唯一的 `odom -> base_footprint`。
- **MPU6050 坐标约定**：`/imu/data_raw` 的 `frame_id` 为 `base_link`；MPU6050 芯片中心等同 `base_link` 原点，右手系 `+x` 前、`+y` 左、`+z` 上。
- **WebSocket 通信桥接**：集成 `rosbridge_server`（`rosbridge_websocket_launch.xml`），提供 9090 端口的 WebSocket 接口，方便 Web 端与小车进行交互。
- **Xbox 手柄遥控控制**：集成 `joy` 与单一 `joystick_teleop` 控制节点，支持左摇杆上下控制前后移动、左摇杆左右控制旋转、D-pad 恒速控制前后与左右平移；右摇杆不参与控制，默认配备 LB 安全使能与 RB Turbo。
- **可选 USB 单目相机**：`use_hik_camera:=true` 时包含 `hik_camera_bringup`；相机和 `web_video_server` 预览默认关闭，避免未接硬件或预览负载影响控制栈。

## 目录结构

```
smartcar_bringup/
├── urdf/
│   ├── smartcar.urdf.xacro           # 主模型：底盘 + 4 轮
│   └── smartcar.ros2_control.xacro   # ros2_control 硬件宏（mock/实机切换）
├── config/
│   ├── controllers.yaml              # 控制器与运动学参数配置
│   ├── ekf_odom.yaml                 # robot_localization 局部 EKF 参数
│   └── xbox_teleop.yaml              # Xbox 手柄摇杆、D-pad 与安全参数配置
├── launch/
│   ├── smartcar.launch.py            # 一键启动 launch 脚本（含 rosbridge_server 与可选手柄）
│   └── joy_teleop.launch.py          # Xbox 手柄独立遥控 launch 脚本
├── scripts/
│   └── joystick_teleop.py             # 统一手柄输入与速度发布节点
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

# 树莓派实机启动 + 里程计 / MPU6050 EKF 融合
ros2 launch smartcar_bringup smartcar.launch.py \
  use_mock_hardware:=false serial_port:=/dev/ttyUSB0 use_ekf:=true

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
| use_ekf | `false` | 是否启动 `ekf_filter_node_odom`；实车融合必须显式设为 `true` |
| i2c_device | `/dev/i2c-1` | MPU6050 I2C 总线设备 |
| i2c_address | `0x68` | MPU6050 I2C 地址 |
| use_joy | `false` | 是否同时启动 Xbox 手柄遥控栈 |
| joy_dev | `/dev/input/js0` | 手柄 Linux 设备节点路径 |
| use_hik_camera | `false` | 是否包含 `hik_camera_bringup` 相机采集链路 |
| use_web_preview | `false` | 是否在已启用相机时启动 Web 图像预览 |

## Xbox 手柄遥控映射说明

`config/xbox_teleop.yaml` 针对标准 Xbox 手柄（Linux `/dev/input/js0`）配置了摇杆、D-pad 和安全映射：

- **左摇杆上下 (Axis 1)**：控制 `linear.x`；上为负值，下为正值。
- **左摇杆左右 (Axis 0)**：控制 `angular.z`；左为负值，右为正值。
- **当前 Xbox D-pad 轴输入**：实测 `/joy.buttons` 长度为 11，方向键使用水平 `Axis 6` 和垂直 `Axis 7`；上为 `Axis 7=+1`，下为 `Axis 7=-1`，左为 `Axis 6=-1`，右为 `Axis 6=+1`。
- **D-pad 按钮兼容输入**：其他手柄可用上/下/左/右 `Button 12/13/14/15`，并将 `dpad_mode` 改为 `buttons` 或 `auto`；当前 Xbox 配置不使用这组按钮索引。
- **方向键速度**：普通模式默认 `0.5 m/s`，Turbo 模式默认 `1.0 m/s`；可通过 `dpad_speed` 和 `dpad_turbo_speed` 调整。
- **LB 键 (Button 4)**：安全使能按键；默认必须按住 LB 才输出指令。
- **RB 键 (Button 5)**：Turbo 按键；同时作用于方向键和左摇杆。
- **右摇杆 (Axis 2/3)**：不参与控制。
- D-pad 轴输入优先于左摇杆平移；同时按相反方向时分量抵消，同时按相邻方向时支持斜向平移。


输出话题为 `/mecanum_drive_controller/reference`（消息类型：`geometry_msgs/msg/TwistStamped`）。可编辑映射图见 [docs/xbox_手柄映射.drawio](../../docs/xbox_手柄映射.drawio)，PNG 预览见 [docs/xbox_手柄映射.png](../../docs/xbox_手柄映射.png)。

## 键盘遥控注意事项

Jazzy 的 `mecanum_drive_controller` 订阅 `geometry_msgs/msg/TwistStamped` 类型的 `/mecanum_drive_controller/reference` 话题，而 `teleop_twist_keyboard` 默认发布不带时间戳的 `Twist`。因此键盘遥控必须加 `stamped:=true` 并 remap 话题：

```bash
ros2 run teleop_twist_keyboard teleop_twist_keyboard \
  --ros-args -p stamped:=true \
  -r /cmd_vel:=/mecanum_drive_controller/reference
```

## 验证

完整验证步骤（控制器状态、8 个状态 + 4 个命令接口、前进 / 横移 / 旋转里程计方向）请参考 [验证手册](doc/验证手册.md) 。

EKF 融合验证：

```bash
ros2 topic hz /imu/data_raw
ros2 topic hz /mecanum_drive_controller/odometry
ros2 topic hz /odometry/filtered
ros2 topic echo /odometry/filtered --once
ros2 run tf2_ros tf2_echo odom base_footprint
```

## 依赖

- `controller_manager`、`mecanum_drive_controller`、`joint_state_broadcaster`、`battery_state_broadcaster`
- `robot_state_publisher`、`xacro`
- `robot_localization`（可选 EKF 融合，启用 `use_ekf:=true` 时必需）
- `libi2c-dev`、`i2c-tools`（MPU6050 构建、I2C 总线探测与实机验证）
- `rosbridge_server`（WebSocket 桥接服务）
- `joy`（Xbox 手柄输入）
- `motor_driver`（实机模式；本仓库同级包）
- `hik_camera_bringup`（可选 USB 单目相机；实机还需安装系统 `usb_cam` 依赖）

## 许可证

Apache-2.0（详见 [package.xml](package.xml) ）。
