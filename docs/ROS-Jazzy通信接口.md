# ROS 2 Jazzy 通信接口说明

本文档梳理本项目当前使用的 ROS 2 Jazzy 通信接口，面向首次接触本仓库的开发者。
消息类型、话题名、频率与对应节点均以实机 bringup（`smartcar.launch.py`）为准。

相关底层串口协议见 [协议总结.md](协议总结.md)。

---

## 1. 节点拓扑

```text
Linux 手柄设备 (/dev/input/jsX)
        │
        ▼
    joy_node
        │  sensor_msgs/Joy (/joy)
        ▼
joystick_teleop_node / ros-mcp-server / teleop_twist_keyboard / Web UI（控制下发）
        │  geometry_msgs/TwistStamped
        ▼
mecanum_drive_controller ──► /mecanum_drive_controller/odometry（原始轮速里程计）
        │
        ├──────────────────────────────┐
        ▼                              │
  web_telemetry_adapter
        │  geometry_msgs/TwistStamped + geometry_msgs/PoseStamped
        ▼
rosbridge_websocket / Web UI（轻量遥测订阅，端口 9090）
                                       │
MPU6050 (I2C-1, 0x68)                 │
        │                              │
        ▼                              │
   mpu6050_sensor                      │
        │  sensor_msgs/Imu             │
        ▼                              │
   /imu/data_raw ──────────────────────┤
                                       ▼
                            ekf_filter_node_odom
                            (robot_localization, use_ekf:=true)
                                       │
                         ┌─────────────┴─────────────┐
                         ▼                           ▼
                   /odometry/filtered        /tf: odom -> base_footprint
                                                     │
                                                     ▼
                         /tf_static: base_footprint -> base_link
                         (robot_state_publisher / URDF)

mecanum_drive_controller
        │  velocity 命令 × 4
        ▼
controller_manager / MecanumSystemHardware (motor_driver)
        │  USB 串口 ASCII
        ▼
4 路电机驱动板 ──► MG310 × 4
        │
        ├── $MAll / $MTEP ──► joint 状态
        └── $read_vol ──────► battery_state/voltage
                                    │
                                    ▼
                         battery_state_broadcaster
                                    │
                                    ▼
                              /battery_state

```

主要节点 / 组件：

| 名称 (Name) | 类型 (Type) | 职责 (Role) |
|---|---|---|
| `/robot_state_publisher` | 节点 | 发布 `robot_description` 与静态 TF，其中包含 `base_footprint -> base_link` |
| `/controller_manager` | 节点 | 加载硬件插件与控制器 |
| `/smartcar_system` | 硬件组件 | `motor_driver/MecanumSystemHardware` 串口驱动 |
| `/joint_state_broadcaster` | 控制器 | 关节状态 → `/joint_states` |
| `/mecanum_drive_controller` | 控制器 | 麦轮全向运动学解算（前后轴距 0.135 m，左右轮距 0.16462 m，投影和 $lx+ly=0.14981\text{ m}$） + 原始轮速里程计；`enable_odom_tf=false` |
| `/battery_state_broadcaster` | 控制器 | 电压状态 → `/battery_state` |
| `/mpu6050_sensor` | 节点 | MPU6050 IMU 驱动，发布 `/imu/data_raw` |
| `/ekf_filter_node_odom` | 节点 | `robot_localization` EKF 融合节点；显式 `use_ekf:=true` 时启动，输出 `/odometry/filtered` 与 `odom -> base_footprint` |
| `/joy_node` | 节点 | Linux 游戏手柄接入驱动（`joy` 包），发布 `/joy` |
| `/joystick_teleop_node` | 节点 | 项目手柄遥控节点，解析 `/joy`，支持 Xbox D-pad 恒速平移、左摇杆前进与旋转，并转为 `TwistStamped` |
| `/web_telemetry_adapter` | 节点 | 订阅 `/mecanum_drive_controller/odometry`，发布 `/web/telemetry/twist` 与 `/web/telemetry/pose` 供 Web 侧消费 |
| `/rosbridge_websocket` | 节点 | WebSocket 通信桥接服务（端口 `9090`，`rosbridge_server` 包），供 Web 上层下发控制并订阅轻量遥测接口 |
| ros-mcp-server / teleop | 外部 | 向 `/mecanum_drive_controller/reference` 下发速度指令 |

控制循环默认 **50 Hz**（见 `controllers.yaml` 的 `update_rate`）。

---

## 2. 话题接口一览

| 话题 (Topic) | 消息类型 (Type) | 方向 | 典型频率 | 发布方 | 含义 |
|---|---|---|---|---|---|
| `/mecanum_drive_controller/reference` | `geometry_msgs/msg/TwistStamped` | 订阅 | 由发布方决定（遥控建议 ≥ 10 Hz） | `joystick_teleop_node` / MCP / `teleop_twist_keyboard` / WebSocket | 期望车体速度；超时 `reference_timeout=0.5 s` 后清零 |
| `/mecanum_drive_controller/odometry` | `nav_msgs/msg/Odometry` | 发布 | ~50 Hz | `mecanum_drive_controller` | 原始轮速积分里程计；作为 EKF 的 `odom0` 输入，也作为 Web 遥测适配器输入 |
| `/imu/data_raw` | `sensor_msgs/msg/Imu` | 发布 | ~100 Hz | `mpu6050_sensor` | MPU6050 原始 IMU 数据；`frame_id=base_link`，作为 EKF 的 `imu0` 输入 |
| `/odometry/filtered` | `nav_msgs/msg/Odometry` | 发布 | ~30 Hz | `ekf_filter_node_odom` | 轮速里程计与 MPU6050 融合后的局部里程计输出；仅在 `use_ekf:=true` 时存在 |
| `/web/telemetry/twist` | `geometry_msgs/msg/TwistStamped` | 发布 | ~50 Hz | `web_telemetry_adapter` | 供 `rosbridge` / Web UI 订阅的轻量速度遥测接口，字段对应底盘平面线速度与角速度 |
| `/web/telemetry/pose` | `geometry_msgs/msg/PoseStamped` | 发布 | ~50 Hz | `web_telemetry_adapter` | 供 `rosbridge` / Web UI 订阅的轻量二维位姿接口；保留 `header`、`pose.position.x/y` 和由平面偏航转换得到的四元数 |
| `/mecanum_drive_controller/controller_state` | `control_msgs/msg/MecanumDriveControllerState` | 发布 | ~50 Hz | `mecanum_drive_controller` | 控制器内部状态（含各轮速度） |
| `/joint_states` | `sensor_msgs/msg/JointState` | 发布 | ~50 Hz | `joint_state_broadcaster` | 四轮 `position` / `velocity` |
| `/dynamic_joint_states` | `control_msgs/msg/DynamicJointState` | 发布 | ~50 Hz | `joint_state_broadcaster` | 动态关节状态（含全部状态接口） |
| `/tf` | `tf2_msgs/msg/TFMessage` | 发布 | ~30 Hz | `ekf_filter_node_odom` + `robot_state_publisher` | EKF 独占发布 `odom -> base_footprint`；`robot_state_publisher` 只发布模型 / 关节 TF，不拥有 `odom` 坐标系 |
| `/tf_static` | `tf2_msgs/msg/TFMessage` | 发布 | 锁存 | `robot_state_publisher` | URDF 静态坐标变换，包含 `base_footprint -> base_link` |
| `/robot_description` | `std_msgs/msg/String` | 发布 | 锁存 | `robot_state_publisher` | URDF 字符串 |
| `/joy` | `sensor_msgs/msg/Joy` | 发布 | ~20 Hz | `joy_node` | 手柄物理摇杆与按键原始状态 |
| `/battery_state` | `sensor_msgs/msg/BatteryState` | 发布 | ~1 Hz | `battery_state_broadcaster` | 电池电压等（见 §3） |

> 说明：`battery_state_broadcaster` 原生话题为 `/battery_state_broadcaster/battery_state`，
> launch 中已 remap 为 `/battery_state`。

> Web 遥测说明：`/mecanum_drive_controller/odometry` 继续保留给 ROS 内部调试、
> 记录、Web 遥测适配器与算法模块使用。即使启用 EKF，`web_telemetry_adapter`
> 仍订阅原始 `/mecanum_drive_controller/odometry`，不切换到 `/odometry/filtered`。
> Web UI 不通过 `rosbridge` 直接订阅原始 `Odometry`，而是订阅
> `/web/telemetry/twist`（`TwistStamped`）与 `/web/telemetry/pose`（`PoseStamped`）。
> 适配后的两种消息均可被 `rosbridge_websocket` 序列化，从而消除原始 `Odometry` 与旧版
> `Pose2D` 的序列化异常。

### 2.1 TF 所有权

| 变换 | 发布方 | 类型 | 说明 |
|---|---|---|---|
| `odom -> base_footprint` | `ekf_filter_node_odom` | 动态 TF | 仅在 `use_ekf:=true` 时由 EKF 发布；这是当前唯一的里程计动态 TF 所有者 |
| `base_footprint -> base_link` | `robot_state_publisher` | 静态 TF | 来自 URDF，用于把地面投影坐标系连接到车体坐标系 |
| 轮子等模型内部坐标 | `robot_state_publisher` | 静态 / 关节 TF | 根据 URDF 与 `/joint_states` 发布，不拥有 `odom` 坐标系 |

控制器 `enable_odom_tf=false`，只保留 `/mecanum_drive_controller/odometry`
作为原始 `Odometry` 消息，不发布最终动态 `odom` TF。需要检查到 `base_link`
时，应验证 `odom -> base_footprint -> base_link` 这条完整 TF 链。

---

## 3. 电池电量接口

### 3.1 ROS 侧

- **话题：** `/battery_state`
- **类型：** `sensor_msgs/msg/BatteryState`
- **关键字段：**
  - `voltage`：驱动板回报的母线电压（V），2S 锂电常见约 6.0–8.4 V
  - `design_capacity`：配置占位（默认 2.0 Ah）
  - `power_supply_technology`：`2`（`POWER_SUPPLY_TECHNOLOGY_LION`）
  - `percentage` / `current` / `charge`：驱动板未提供，保持 NaN

### 3.2 硬件 / 串口侧

| 步骤 | 内容 |
|---|---|
| 状态接口 | `battery_state/voltage`（由 `MecanumSystemHardware` 导出） |
| 查询指令 | `$read_vol#` |
| 应答帧 | `$Battery:7.40V#` |
| 轮询周期 | `battery_poll_period_ms`（默认 1000 ms） |
| 失败策略 | 打 WARN，保留上次有效电压，不触发电机通信丢失 |

串口由 `motor_driver` **独占**，不可另起独立进程再开 `/dev/ttyUSB0`。

---

## 4. ros2_control 硬件接口

硬件插件：`motor_driver/MecanumSystemHardware`

| 接口全名 | 类型 | 单位 | 说明 |
|---|---|---|---|
| `front_left_wheel_joint/velocity` | command | rad/s | 左前目标角速度 |
| `front_right_wheel_joint/velocity` | command | rad/s | 右前目标角速度 |
| `rear_left_wheel_joint/velocity` | command | rad/s | 左后目标角速度 |
| `rear_right_wheel_joint/velocity` | command | rad/s | 右后目标角速度 |
| `*/position`、`*/velocity` | state | rad、rad/s | 各轮位置与角速度 |
| `battery_state/voltage` | state | V | 电池电压 |

电机丝印与关节对应（实车接线）：

| 丝印 | 车轮 | 关节名 | 方向系数默认 |
|---|---|---|---|
| M1 | 右前 | `front_right_wheel_joint` | `direction_m1 = 1` |
| M2 | 左前 | `front_left_wheel_joint` | `direction_m2 = -1` |
| M3 | 右后 | `rear_right_wheel_joint` | `direction_m3 = -1` |
| M4 | 左后 | `rear_left_wheel_joint` | `direction_m4 = 1` |

方向系数标定记录见 [smartcar_bringup/doc/验证手册.md](../src/smartcar_bringup/doc/验证手册.md) §3.2。

---

## 5. Xbox 手柄遥控通信接口

### 5.1 启动与节点拓扑

手柄遥控功能可通过 `smartcar.launch.py` 参数 `use_joy:=true` 一键启动，也可通过 `joy_teleop.launch.py` 独立拉起：

```bash
ros2 launch smartcar_bringup joy_teleop.launch.py joy_dev:=/dev/input/js0
```

`joy_teleop.launch.py` 使用 `OpaqueFunction` 实现了智能参数解析机制：
- 当传入 `joy_dev:=/dev/input/jsX` 时，自动提取后缀数字 `X` 作为整型 `device_id` 传递给 `joy_node`，避免由于设备路径赋给 `device_name` 导致匹配失败。
- 当传入数字（如 `joy_dev:=0`）时，直接解析为 `device_id` 传入。

### 5.2 摇杆与按键控制映射表

`config/xbox_teleop.yaml` 对标准 Xbox 手柄（Linux `/dev/input/js0`）的映射如下：

| 控制物理量 | 操作方式 | 对应轴 / 按键索引 | 默认限制 | Turbo 加速模式 (RB) |
|---|---|---|---|---|
| **前后移动 (`linear.x`)** | 左摇杆上下 | Axis 1 (`axis_linear.x: 1`) | 0.5 m/s | 1.0 m/s |
| **转弯 / 旋转 (`angular.z`)** | 左摇杆左右 | Axis 0 (`axis_angular.yaw: 0`) | 1.5 rad/s | 3.0 rad/s |
| **前进 (`linear.x`)** | D-pad 上 | 当前模式为 Vertical Axis 7 = +1 | 0.5 m/s | 1.0 m/s |
| **后退 (`linear.x`)** | D-pad 下 | 当前模式为 Vertical Axis 7 = -1 | 0.5 m/s | 1.0 m/s |
| **左平移 (`linear.y`)** | D-pad 左 | 当前模式为 Horizontal Axis 6 = -1 | 0.5 m/s | 1.0 m/s |
| **右平移 (`linear.y`)** | D-pad 右 | 当前模式为 Horizontal Axis 6 = +1 | 0.5 m/s | 1.0 m/s |
| **安全使能按键** | 按住 LB 键 | Button 4 (`enable_button: 4`) | 必需按住才输出指令 | 必需按住才输出指令 |
| **提速 Turbo 按键** | 按住 RB 键 | Button 5 (`enable_turbo_button: 5`) | - | 切换至加速模式限速 |

D-pad 是数字恒速控制。当前 Xbox 手柄的 `/joy.buttons` 长度为 11，方向键使用 Axis 6/7；其他手柄可将 `dpad_mode` 设置为 `buttons` 或 `auto`，使用 Button 12/13/14/15 兼容映射。斜向同时按下两个方向时会同时输出 `linear.x` 和 `linear.y`；相反方向同时按下时对应分量抵消。右摇杆 Axis 2/3 不参与平移控制。

---

## 6. MPU6050 IMU 接口

### 6.1 硬件连接

| MPU6050 引脚 | 树莓派引脚 | 说明 |
|---|---|---|
| VCC | Pin 1 (3.3V) | 电源 |
| GND | Pin 6 (GND) | 地 |
| SDA | Pin 3 (GPIO 2) | I2C 数据线 |
| SCL | Pin 5 (GPIO 3) | I2C 时钟线 |
| AD0 | GND | 地址选择，接低电平 = 0x68 |

### 6.2 ROS 侧

- **话题：** `/imu/data_raw`
- **类型：** `sensor_msgs/msg/Imu`
- **频率：** ~100 Hz
- **发布节点：** `mpu6050_sensor`（包 `ros2_mpu6050`，源码位于 `src/ros2_mpu6050`，非 submodule）
- **坐标帧：** `header.frame_id = base_link`
- **I2C 配置：** 设备 `/dev/i2c-1`，地址 `0x68`（参数 `i2c_device` / `i2c_address`）
- **单位：** 线加速度为 m/s^2，角速度为 rad/s
- **姿态：** MPU6050 没有磁力计，不提供可信绝对航向；驱动保持 `orientation_covariance[0] = -1`，EKF 不使用 IMU 绝对 orientation。

### 6.3 安装与坐标约定

- MPU6050 芯片中心按机械定义等同 `base_link` 原点；当前不额外配置平移补偿。
- 车体使用 ROS 右手坐标系：`+x` 指向车头，`+y` 指向车体左侧，`+z` 指向上方。
- 传感器板必须与车体轴平行安装；如果实物方向不一致，应在传感器发布处或显式静态 TF 中修正，不要通过 EKF 变量掩码偷偷交换轴。
- 没有磁力计时，yaw 会随时间漂移；EKF 主要使用 IMU 角速度和线加速度抑制轮速旋转噪声，不能把它理解为绝对航向来源。

### 6.4 启动命令

```bash
# 仅 IMU（I2C-1, 地址 0x68）
ros2 launch smartcar_bringup mpu6050.launch.py

# 自定义 I2C 总线和地址
ros2 launch smartcar_bringup mpu6050.launch.py i2c_device:=/dev/i2c-1 i2c_address:=0x68

# 实机一键 bringup（含电机栈 + MPU6050）
ros2 launch smartcar_bringup smartcar.launch.py \
  use_mock_hardware:=false serial_port:=/dev/ttyUSB0
```

### 6.5 验证

```bash
# 查看 IMU 数据
ros2 topic echo /imu/data_raw

# 查看话题频率
ros2 topic hz /imu/data_raw

# 确认消息坐标帧
ros2 topic echo /imu/data_raw --once
```

---

## 7. EKF 融合接口与验证

EKF 配置文件位于 `src/smartcar_bringup/config/ekf_odom.yaml`，节点名为
`ekf_filter_node_odom`，包为 `robot_localization`。`smartcar.launch.py` 的
`use_ekf` 默认值为 `false`；实车需要融合时，必须显式传入 `use_ekf:=true`。
WSL2 mock 模式默认不启动 EKF，也不启动实机 MPU6050。

### 7.1 输入、输出与状态约束

| 接口 | 角色 | 说明 |
|---|---|---|
| `/mecanum_drive_controller/odometry` | `odom0` 输入 | 只使用轮速里程计的平面速度与 yaw 速度；不重复融合由轮速积分得到的 pose |
| `/imu/data_raw` | `imu0` 输入 | 使用三轴角速度和线加速度；不使用无磁力计的绝对 orientation；协方差由 `ros2_mpu6050` 参数给出 |
| `/odometry/filtered` | EKF 输出 | `nav_msgs/msg/Odometry`，局部 `odom` 世界下的融合里程计 |
| `/tf` | EKF 输出 | 发布 `odom -> base_footprint` |

EKF 以 `two_d_mode=true` 约束地面机器人，只估计平面运动。由于 MPU6050 没有磁力计，
yaw 仍可能长期漂移；融合的意义是降低轮速里程计在旋转和短时打滑时的噪声，不是获得绝对航向。

`/odometry/filtered` 中的 `pose.pose.position.x/y` 始终属于 `odom` 全局坐标。
如果车辆开始测试时已经有非零 yaw，车辆沿自身 x 轴直行也会在 `odom.y` 中产生投影。
比较卷尺横向位移时，应先调用 `/set_pose` 将 EKF 的 x、y、yaw 归零，或把 odom 增量
按测试开始时的 yaw 旋回车体坐标系；不能直接把 `odom.y` 增量当作车体横移距离。

### 7.2 启动与验证命令

```bash
# 1. 安装系统依赖
sudo apt install -y ros-jazzy-robot-localization libi2c-dev i2c-tools

# 2. 修改配置或拉取新代码后重新编译相关包
colcon build --symlink-install --packages-select ros2_mpu6050 smartcar_bringup
source install/setup.bash

# 3. 启动前让小车静止数秒，等待 IMU 偏置稳定
ros2 launch smartcar_bringup smartcar.launch.py \
  use_mock_hardware:=false serial_port:=/dev/ttyUSB0 use_ekf:=true use_camera:=false

# 4. 验证输入频率
ros2 topic hz /imu/data_raw
ros2 topic hz /mecanum_drive_controller/odometry

# 5. 验证融合输出
ros2 topic hz /odometry/filtered
ros2 topic info /odometry/filtered
ros2 topic echo /odometry/filtered --once

# 6. 验证 TF 发布者和坐标链
ros2 topic info /tf
ros2 run tf2_ros tf2_echo odom base_footprint
ros2 run tf2_ros tf2_echo odom base_link
```

`tf2_echo odom base_link` 不是 EKF 直接发布的结果，而是通过
`odom -> base_footprint -> base_link` 静态 / 动态组合链路查询得到。
如果 `/tf` 中出现多个节点同时发布 `odom -> base_footprint`，应先检查
`mecanum_drive_controller` 是否仍为 `enable_odom_tf=false`。

---

## 8. 常用服务（运维）

| 服务 (Service) | 类型 | 用途 |
|---|---|---|
| `/controller_manager/list_controllers` | `controller_manager_msgs/srv/ListControllers` | 查看控制器状态 |
| `/controller_manager/list_hardware_interfaces` | `controller_manager_msgs/srv/ListHardwareInterfaces` | 查看硬件接口认领情况 |
| `/controller_manager/switch_controller` | `controller_manager_msgs/srv/SwitchController` | 启停控制器 |
| `/set_pose` | `robot_localization/srv/SetPose` | 车辆静止时将 EKF 的局部 x、y、yaw 设为测试零点 |

CLI 等价命令：

```bash
ros2 control list_controllers
ros2 control list_hardware_interfaces
```

---

## 9. 依赖包提示

- 工作空间内已包含 `battery_state_broadcaster` 源码包（便于无 root 权限的开发机编译）。
- 树莓派若已安装 `ros-jazzy-battery-state-broadcaster`，可继续使用系统包；二者不要混用同名冲突版本。
- EKF 融合依赖系统包 `ros-jazzy-robot-localization`，实车启用 `use_ekf:=true` 前必须安装。
- `ros2_mpu6050` 以普通源码包形式纳入 `src/`（非 Git Submodule），克隆仓库后直接 `colcon build` 即可；树莓派需安装 `libi2c-dev`。
- `smartcar.launch.py` 在 `use_mock_hardware:=false` 时自动启动 `mpu6050_sensor`；WSL2 mock 模式跳过 IMU。
- `joystick_teleop_node` 当前默认使用 D-pad 轴模式，水平/垂直索引是 `6/7`；其他手柄的按钮兼容索引为上/下/左/右 `12/13/14/15`；速度在 `xbox_teleop.yaml` 中配置。
- `smartcar.launch.py` 的 `use_ekf` 默认 `false`；mock 模式和普通实车 bringup 都不会默认启动 EKF。

---

## 10. 修订记录

| 日期 | 说明 |
|---|---|
| 2026-08-05 | Web 位姿遥测由 `/web/telemetry/pose2d`（`Pose2D`）迁移为 `/web/telemetry/pose`（`PoseStamped`），保留时间戳和坐标系，避免 `rosbridge_websocket` 序列化异常 |
| 2026-08-04 | 补充 `robot_localization` EKF 融合链路：`/mecanum_drive_controller/odometry` 与 `/imu/data_raw` 输入，`/odometry/filtered` 输出，明确 `odom -> base_footprint` 由 EKF 发布、`base_footprint -> base_link` 由 URDF 静态连接 |
| 2026-08-06 | 补充地面直行定位验证：记录 `count_multiplier=4` 的实测尺度误差，并说明 `odom.y` 必须结合起始 yaw 换算，增加 EKF `/set_pose` 归零服务 |
| 2026-08-04 | 新增 `web_telemetry_adapter` 节点说明；补充 `/web/telemetry/twist` 与轻量位姿遥测话题；明确 Web UI 不再直接订阅 `/mecanum_drive_controller/odometry`，以规避 `rosbridge` 序列化 `Odometry` 异常 |
| 2026-08-09 | 按树莓派实测 `/joy` 修正 Xbox D-pad Axis 6/7 符号，默认使用轴模式并保留按钮兼容映射 |
| 2026-07-21 | MPU6050 改为源码纳入；节点读取 `i2c_*` 参数；`smartcar.launch.py` 实机启 IMU |
| 2026-07-21 | 新增 MPU6050 IMU 接口说明（§6） |
| 2026-07-19 | 初版：补充电池 `/battery_state`、方向标定结论与完整话题表 |
