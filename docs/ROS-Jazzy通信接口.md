# ROS 2 Jazzy 通信接口说明

本文档梳理本项目当前使用的 ROS 2 Jazzy 通信接口，面向首次接触本仓库的开发者。
消息类型、话题名、频率与对应节点均以实机 bringup（`smartcar.launch.py`）为准。

相关底层串口协议见 [协议总结.md](协议总结.md)。

---

## 1. 节点拓扑

```text
teleop / ros-mcp-server
        │  TwistStamped
        ▼
mecanum_drive_controller ──► /odometry, /tf (odom→base_link)
        │  velocity 命令 ×4
        ▼
controller_manager / MecanumSystemHardware (motor_driver)
        │  USB 串口 ASCII
        ▼
4 路电机驱动板 ──► MG310 ×4
        │
        ├── $MAll / $MTEP ──► joint 状态
        └── $read_vol ──────► battery_state/voltage
                                    │
                                    ▼
                         battery_state_broadcaster
                                    │
                                    ▼
                              /battery_state

MPU6050 (I2C-1, 0x68)
        │
        ▼
   mpu6050_sensor
        │  sensor_msgs/Imu
        ▼
   /imu/data_raw
```

主要节点 / 组件：

| 名称 (Name) | 类型 (Type) | 职责 (Role) |
|---|---|---|
| `/robot_state_publisher` | 节点 | 发布 `robot_description` 与静态 TF |
| `/controller_manager` | 节点 | 加载硬件插件与控制器 |
| `/smartcar_system` | 硬件组件 | `motor_driver/MecanumSystemHardware` 串口驱动 |
| `/joint_state_broadcaster` | 控制器 | 关节状态 → `/joint_states` |
| `/mecanum_drive_controller` | 控制器 | 麦轮运动学 + 里程计 + TF |
| `/battery_state_broadcaster` | 控制器 | 电压状态 → `/battery_state` |
| `/mpu6050_sensor` | 节点 | MPU6050 IMU 驱动，发布 `/imu/data_raw` |
| ros-mcp-server / teleop | 外部 | 向 `reference` 发速度指令 |

控制循环默认 **50 Hz**（见 `controllers.yaml` 的 `update_rate`）。

---

## 2. 话题接口一览

| 话题 (Topic) | 消息类型 (Type) | 方向 | 典型频率 | 发布方 | 含义 |
|---|---|---|---|---|---|
| `/mecanum_drive_controller/reference` | `geometry_msgs/msg/TwistStamped` | 订阅 | 由发布方决定（遥控建议 ≥ 10 Hz） | MCP / teleop | 期望车体速度；超时 `reference_timeout=0.5 s` 后清零 |
| `/mecanum_drive_controller/odometry` | `nav_msgs/msg/Odometry` | 发布 | ~50 Hz | `mecanum_drive_controller` | 轮速积分里程计 |
| `/mecanum_drive_controller/tf_odometry` | `tf2_msgs/msg/TFMessage` | 发布 | ~50 Hz | `mecanum_drive_controller` | 里程计 TF（若启用） |
| `/mecanum_drive_controller/controller_state` | `control_msgs/msg/MecanumDriveControllerState` | 发布 | ~50 Hz | `mecanum_drive_controller` | 控制器内部状态（含各轮速度） |
| `/joint_states` | `sensor_msgs/msg/JointState` | 发布 | ~50 Hz | `joint_state_broadcaster` | 四轮 `position` / `velocity` |
| `/dynamic_joint_states` | `control_msgs/msg/DynamicJointState` | 发布 | ~50 Hz | `joint_state_broadcaster` | 动态关节状态（含全部状态接口） |
| `/tf` | `tf2_msgs/msg/TFMessage` | 发布 | ~50 Hz | 控制器 + `robot_state_publisher` | 动态坐标变换 |
| `/tf_static` | `tf2_msgs/msg/TFMessage` | 发布 | 锁存 | `robot_state_publisher` | 静态坐标变换 |
| `/robot_description` | `std_msgs/msg/String` | 发布 | 锁存 | `robot_state_publisher` | URDF 字符串 |
| `/battery_state` | `sensor_msgs/msg/BatteryState` | 发布 | ~1 Hz | `battery_state_broadcaster` | 电池电压等（见 §3） |
| `/imu/data_raw` | `sensor_msgs/msg/Imu` | 发布 | ~100 Hz | `mpu6050_sensor` | MPU6050 原始 IMU 数据（见 §8） |

> 说明：`battery_state_broadcaster` 原生话题为 `/battery_state_broadcaster/battery_state`，
> launch 中已 remap 为 `/battery_state`。

### 键盘遥控示例

Jazzy 的麦轮控制器只收 `TwistStamped`，必须加 `stamped:=true`：

```bash
ros2 run teleop_twist_keyboard teleop_twist_keyboard \
  --ros-args -p stamped:=true \
  -r /cmd_vel:=/mecanum_drive_controller/reference
```

### ros-mcp-server 前进示例

话题：`/mecanum_drive_controller/reference`  
类型：`geometry_msgs/msg/TwistStamped`  
建议：`linear.x = 0.1`，`rate_hz = 10`，持续数秒后发零速。

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

## 8. MPU6050 IMU 接口

### 8.1 硬件连接

| MPU6050 引脚 | 树莓派引脚 | 说明 |
|---|---|---|
| VCC | Pin 1 (3.3V) | 电源 |
| GND | Pin 6 (GND) | 地 |
| SDA | Pin 3 (GPIO 2) | I2C 数据线 |
| SCL | Pin 5 (GPIO 3) | I2C 时钟线 |
| AD0 | GND | 地址选择，接低电平 = 0x68 |

### 8.2 ROS 侧

- **话题：** `/imu/data_raw`
- **类型：** `sensor_msgs/msg/Imu`
- **频率：** ~100 Hz
- **发布节点：** `mpu6050_sensor`（包 `ros2_mpu6050`，源码位于 `src/ros2_mpu6050`，非 submodule）
- **I2C 配置：** 设备 `/dev/i2c-1`，地址 `0x68`（参数 `i2c_device` / `i2c_address`）

### 8.3 启动命令

```bash
# 仅 IMU（I2C-1, 地址 0x68）
ros2 launch smartcar_bringup mpu6050.launch.py

# 自定义 I2C 总线和地址
ros2 launch smartcar_bringup mpu6050.launch.py i2c_device:=/dev/i2c-1 i2c_address:=0x68

# 实机一键 bringup（含电机栈 + MPU6050）
ros2 launch smartcar_bringup smartcar.launch.py \
  use_mock_hardware:=false serial_port:=/dev/ttyUSB0
```

### 8.4 验证

```bash
# 查看 IMU 数据
ros2 topic echo /imu/data_raw

# 查看话题频率
ros2 topic hz /imu/data_raw
```

---

## 9. 常用服务（运维）

| 服务 (Service) | 类型 | 用途 |
|---|---|---|
| `/controller_manager/list_controllers` | `controller_manager_msgs/srv/ListControllers` | 查看控制器状态 |
| `/controller_manager/list_hardware_interfaces` | `controller_manager_msgs/srv/ListHardwareInterfaces` | 查看硬件接口认领情况 |
| `/controller_manager/switch_controller` | `controller_manager_msgs/srv/SwitchController` | 启停控制器 |

CLI 等价命令：

```bash
ros2 control list_controllers
ros2 control list_hardware_interfaces
```

---

## 6. 依赖包提示

- 工作空间内已包含 `battery_state_broadcaster` 源码包（便于无 root 权限的开发机编译）。
- 树莓派若已安装 `ros-jazzy-battery-state-broadcaster`，可继续使用系统包；二者不要混用同名冲突版本。
- `ros2_mpu6050` 以普通源码包形式纳入 `src/`（非 Git Submodule），克隆仓库后直接 `colcon build` 即可；树莓派需安装 `libi2c-dev`。
- `smartcar.launch.py` 在 `use_mock_hardware:=false` 时自动启动 `mpu6050_sensor`；WSL2 mock 模式跳过 IMU。

---

## 7. 修订记录

| 日期 | 说明 |
|---|---|
| 2026-07-21 | MPU6050 改为源码纳入；节点读取 `i2c_*` 参数；`smartcar.launch.py` 实机启 IMU |
| 2026-07-21 | 新增 MPU6050 IMU 接口说明（§8） |
| 2026-07-19 | 初版：补充电池 `/battery_state`、方向标定结论与完整话题表 |
