# smartcar_bringup

四轮麦克纳姆小车的模型、控制器配置与启动包。提供 xacro 底盘模型（含
`<ros2_control>` 标签）、`controllers.yaml`（`joint_state_broadcaster` +
`mecanum_drive_controller`）以及一键启动的 launch 文件。

- 包类型：`ament_cmake`（纯资源包，无编译产物）
- ROS 版本：ROS 2 Jazzy

## 特性

- **mock / 实机双模式**：launch 参数 `use_mock_hardware` 为 `true` 时用
  `mock_components/GenericSystem`（WSL2 无硬件调试），为 `false` 时加载
  `motor_driver` 串口插件。
- **几何参数化**：轮半径、前后轮距、左右轮距均为 xacro 参数，实车测量后集中修改。
- **全向运动学 + 里程计**：`mecanum_drive_controller` 解算 4 轮速度并发布
  `/odom` 与 `odom → base_link` 的 TF。

## 目录结构

```
smartcar_bringup/
├── urdf/
│   ├── smartcar.urdf.xacro           # 主模型：底盘 + 4 轮
│   └── smartcar.ros2_control.xacro   # ros2_control 硬件宏（mock/实机切换）
├── config/
│   └── controllers.yaml              # 两个控制器 + 运动学参数
├── launch/
│   └── smartcar.launch.py            # 一键启动
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

# WSL2 mock 仿真（默认 use_mock_hardware:=true）
ros2 launch smartcar_bringup smartcar.launch.py

# 树莓派实机
ros2 launch smartcar_bringup smartcar.launch.py \
  use_mock_hardware:=false serial_port:=/dev/ttyUSB0
```

## Launch 参数

| 参数名 (Argument) | 默认值 (Default) | 说明 (Description) |
|---|---|---|
| use_mock_hardware | `true` | `true`=mock 仿真；`false`=实机串口驱动 |
| serial_port | `/dev/ttyUSB0` | 实机驱动板串口设备名 |
| baud_rate | `115200` | 串口波特率 |
| use_rviz | `false` | 是否同时打开 RViz2 |

## 控制器配置

`config/controllers.yaml` 配置两个控制器：

- **joint_state_broadcaster**：广播全部状态接口为 `/joint_states`。
- **mecanum_drive_controller**：麦轮运动学解算 + 里程计。

关键运动学参数（须与 URDF 几何一致）：

| 参数 (Param) | 值 (Value) | 说明 (Description) |
|---|---|---|
| kinematics.wheels_radius | 0.03 | 轮半径，单位 m |
| kinematics.sum_of_robot_center_projection_on_X_Y_axis | 0.206 | `lx + ly`（半轴距 0.110 + 半轮距 0.096） |
| base_frame_id | `base_link` | 机体坐标系 |
| odom_frame_id | `odom` | 里程计坐标系 |
| enable_odom_tf | `true` | 发布 `odom → base_link` 的 TF |

> 更新频率在 WSL2（`/mnt/d` 挂载）下设为 50 Hz 以缓解实时循环超限；
> 部署到树莓派原生文件系统可提升到 100 Hz。

## 键盘遥控注意事项

Jazzy 的 `mecanum_drive_controller` 订阅 `geometry_msgs/msg/TwistStamped`
类型的 `/mecanum_drive_controller/reference` 话题，而 `teleop_twist_keyboard`
默认发布不带时间戳的 `Twist`。因此遥控必须加 `stamped:=true` 并 remap 话题：

```bash
ros2 run teleop_twist_keyboard teleop_twist_keyboard \
  --ros-args -p stamped:=true \
  -r /cmd_vel:=/mecanum_drive_controller/reference
```

## 验证

完整验证步骤（控制器状态、8 状态 + 4 命令接口、前进/横移/旋转里程计方向）
见 [doc/验证手册.md](doc/验证手册.md)。

## 依赖

- `controller_manager`、`mecanum_drive_controller`、`joint_state_broadcaster`
- `robot_state_publisher`、`xacro`
- `motor_driver`（实机模式；本仓库同级包）

## 许可证

Apache-2.0（见 package.xml）。
