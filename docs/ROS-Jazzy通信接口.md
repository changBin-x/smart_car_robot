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
teleop_twist_joy_node / ros-mcp-server / teleop_twist_keyboard / Web UI（控制下发）
        │  geometry_msgs/TwistStamped
        ▼
mecanum_drive_controller ──► /odometry, /tf (odom → base_link)
        │
        ▼
  web_telemetry_adapter
        │  geometry_msgs/TwistStamped + geometry_msgs/Pose2D
        ▼
rosbridge_websocket / Web UI（轻量遥测订阅，端口 9090）

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
| `/mecanum_drive_controller` | 控制器 | 麦轮全向运动学解算（前后轴距 0.135 m，左右轮距 0.16462 m，投影和 $lx+ly=0.14981\text{ m}$） + 里程计 + TF |
| `/battery_state_broadcaster` | 控制器 | 电压状态 → `/battery_state` |
| `/mpu6050_sensor` | 节点 | MPU6050 IMU 驱动，发布 `/imu/data_raw` |
| `/joy_node` | 节点 | Linux 游戏手柄接入驱动（`joy` 包），发布 `/joy` |
| `/teleop_twist_joy_node` | 节点 | 手柄遥控转换节点（`teleop_twist_joy` 包），解析 `/joy` 转为 `TwistStamped` |
| `/web_telemetry_adapter` | 节点 | 订阅 `/mecanum_drive_controller/odometry`，发布 `/web/telemetry/twist` 与 `/web/telemetry/pose2d` 供 Web 侧消费 |
| `/rosbridge_websocket` | 节点 | WebSocket 通信桥接服务（端口 `9090`，`rosbridge_server` 包），供 Web 上层下发控制并订阅轻量遥测接口 |
| ros-mcp-server / teleop | 外部 | 向 `/mecanum_drive_controller/reference` 下发速度指令 |

控制循环默认 **50 Hz**（见 `controllers.yaml` 的 `update_rate`）。

---

## 2. 话题接口一览

| 话题 (Topic) | 消息类型 (Type) | 方向 | 典型频率 | 发布方 | 含义 |
|---|---|---|---|---|---|
| `/mecanum_drive_controller/reference` | `geometry_msgs/msg/TwistStamped` | 订阅 | 由发布方决定（遥控建议 ≥ 10 Hz） | `teleop_twist_joy_node` / MCP / `teleop_twist_keyboard` / WebSocket | 期望车体速度；超时 `reference_timeout=0.5 s` 后清零 |
| `/mecanum_drive_controller/odometry` | `nav_msgs/msg/Odometry` | 发布 | ~50 Hz | `mecanum_drive_controller` | 轮速积分里程计 |
| `/web/telemetry/twist` | `geometry_msgs/msg/TwistStamped` | 发布 | ~50 Hz | `web_telemetry_adapter` | 供 `rosbridge` / Web UI 订阅的轻量速度遥测接口，字段对应底盘平面线速度与角速度 |
| `/web/telemetry/pose2d` | `geometry_msgs/msg/Pose2D` | 发布 | ~50 Hz | `web_telemetry_adapter` | 供 `rosbridge` / Web UI 订阅的轻量二维位姿接口，仅保留 `x`、`y`、`theta` |
| `/mecanum_drive_controller/tf_odometry` | `tf2_msgs/msg/TFMessage` | 发布 | ~50 Hz | `mecanum_drive_controller` | 里程计 TF（若启用） |
| `/mecanum_drive_controller/controller_state` | `control_msgs/msg/MecanumDriveControllerState` | 发布 | ~50 Hz | `mecanum_drive_controller` | 控制器内部状态（含各轮速度） |
| `/joint_states` | `sensor_msgs/msg/JointState` | 发布 | ~50 Hz | `joint_state_broadcaster` | 四轮 `position` / `velocity` |
| `/dynamic_joint_states` | `control_msgs/msg/DynamicJointState` | 发布 | ~50 Hz | `joint_state_broadcaster` | 动态关节状态（含全部状态接口） |
| `/tf` | `tf2_msgs/msg/TFMessage` | 发布 | ~50 Hz | 控制器 + `robot_state_publisher` | 动态坐标变换 |
| `/tf_static` | `tf2_msgs/msg/TFMessage` | 发布 | 锁存 | `robot_state_publisher` | 静态坐标变换 |
| `/robot_description` | `std_msgs/msg/String` | 发布 | 锁存 | `robot_state_publisher` | URDF 字符串 |
| `/joy` | `sensor_msgs/msg/Joy` | 发布 | ~20 Hz | `joy_node` | 手柄物理摇杆与按键原始状态 |
| `/battery_state` | `sensor_msgs/msg/BatteryState` | 发布 | ~1 Hz | `battery_state_broadcaster` | 电池电压等（见 §3） |
| `/imu/data_raw` | `sensor_msgs/msg/Imu` | 发布 | ~100 Hz | `mpu6050_sensor` | MPU6050 原始 IMU 数据（见 §6） |

> 说明：`battery_state_broadcaster` 原生话题为 `/battery_state_broadcaster/battery_state`，
> launch 中已 remap 为 `/battery_state`。

> Web 遥测说明：`/mecanum_drive_controller/odometry` 继续保留给 ROS 内部调试、
> 记录与算法模块使用。Web UI 不再通过 `rosbridge` 直接订阅原始 `Odometry`，
> 而是改为订阅 `/web/telemetry/twist` 与 `/web/telemetry/pose2d`。这样可以规避
> 树莓派实机上 `rosbridge_websocket` 直接序列化 `nav_msgs/msg/Odometry` 时出现的
> `cannot serialize type <class 'nav_msgs.msg._odometry.Odometry'>` 异常。

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
| **左右平移 (`linear.y`)** | 右摇杆左右 | Axis 3 (`axis_linear.y: 3`) | 0.5 m/s | 1.0 m/s |
| **安全使能按键** | 按住 LB 键 | Button 4 (`enable_button: 4`) | 必需按住才输出指令 | 必需按住才输出指令 |
| **提速 Turbo 按键** | 按住 RB 键 | Button 5 (`enable_turbo_button: 5`) | - | 切换至加速模式限速 |

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
- **I2C 配置：** 设备 `/dev/i2c-1`，地址 `0x68`（参数 `i2c_device` / `i2c_address`）

### 6.3 启动命令

```bash
# 仅 IMU（I2C-1, 地址 0x68）
ros2 launch smartcar_bringup mpu6050.launch.py

# 自定义 I2C 总线和地址
ros2 launch smartcar_bringup mpu6050.launch.py i2c_device:=/dev/i2c-1 i2c_address:=0x68

# 实机一键 bringup（含电机栈 + MPU6050）
ros2 launch smartcar_bringup smartcar.launch.py \
  use_mock_hardware:=false serial_port:=/dev/ttyUSB0
```

### 6.4 验证

```bash
# 查看 IMU 数据
ros2 topic echo /imu/data_raw

# 查看话题频率
ros2 topic hz /imu/data_raw
```

---

## 7. 常用服务（运维）

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

## 8. 依赖包提示

- 工作空间内已包含 `battery_state_broadcaster` 源码包（便于无 root 权限的开发机编译）。
- 树莓派若已安装 `ros-jazzy-battery-state-broadcaster`，可继续使用系统包；二者不要混用同名冲突版本。
- `ros2_mpu6050` 以普通源码包形式纳入 `src/`（非 Git Submodule），克隆仓库后直接 `colcon build` 即可；树莓派需安装 `libi2c-dev`。
- `smartcar.launch.py` 在 `use_mock_hardware:=false` 时自动启动 `mpu6050_sensor`；WSL2 mock 模式跳过 IMU。

---

## 9. 修订记录

| 日期 | 说明 |
|---|---|
| 2026-08-04 | 新增 `web_telemetry_adapter` 节点说明；补充 `/web/telemetry/twist` 与 `/web/telemetry/pose2d` 两个轻量遥测话题；明确 Web UI 不再直接订阅 `/mecanum_drive_controller/odometry`，以规避 `rosbridge` 序列化 `Odometry` 异常 |
| 2026-07-23 | 全面重构通信接口说明：补充 `joy_node` 与 `teleop_twist_joy_node` 节点拓扑及 `/joy` 话题表；补充 `/rosbridge_websocket` 服务节点（端口 `9090`）；新增 §5 Xbox 手柄遥控接口章；更新底层麦轮运动学几何参数与投影和数值；按 `/chinese-documentation` 规范化排版 |
| 2026-07-21 | MPU6050 改为源码纳入；节点读取 `i2c_*` 参数；`smartcar.launch.py` 实机启 IMU |
| 2026-07-21 | 新增 MPU6050 IMU 接口说明（§6） |
| 2026-07-19 | 初版：补充电池 `/battery_state`、方向标定结论与完整话题表 |
