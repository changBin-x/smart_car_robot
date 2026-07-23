# 设计文档：ROS 2 Jazzy 通信接口文档更新规范

## 1. 目标与背景

针对项目近期在 Xbox 手柄遥控控制栈（智能 `device_id` 解析、最新 Axis 1/0/3 摇杆映射）、底盘几何参数同步（$lx + ly = 0.14981\text{ m}$）等方面的更新，按照 `/chinese-documentation` 技能规范，对 [docs/ROS-Jazzy通信接口.md](../../ROS-Jazzy通信接口.md) 进行全面重构与同步更新，使其与当前项目实机与仿真状态保持 100% 一致。

---

## 2. 详细设计规范

### 2.1 节点拓扑与节点一览表更新
- **拓扑图更新**：在文本拓扑图中新增手柄控制链路：
  `Linux 手柄设备 (/dev/input/jsX) ──► joy_node ──► /joy (sensor_msgs/msg/Joy) ──► teleop_twist_joy_node ──► /mecanum_drive_controller/reference (geometry_msgs/msg/TwistStamped)`
- **节点表补充**：
  - `/joy_node`：游戏手柄硬件接入节点（`joy` 包），读取 Linux 接口并发布 `/joy`
  - `/teleop_twist_joy_node`：手柄指令转换节点（`teleop_twist_joy` 包），解析 `/joy` 并转换发布 `TwistStamped`

### 2.2 话题接口一览表更新
- 新增 `/joy` 话题：
  - 消息类型：`sensor_msgs/msg/Joy`
  - 方向：发布
  - 典型频率：~20 Hz（由 `autorepeat_rate` 决定）
  - 发布方：`joy_node`
  - 含义：手柄按键与摇杆原始轴状态
- 更新 `/mecanum_drive_controller/reference` 话题发布方：`teleop_twist_joy_node` / MCP / `teleop_twist_keyboard`。

### 2.3 新增 Xbox 手柄遥控通信接口小节 (§5)
- **参数解析说明**：说明 `joy_teleop.launch.py` 内部使用 `OpaqueFunction` 自动提取 `/dev/input/jsX` 中的数字 `X` 作为 `device_id` 传递给 `joy_node` 的机制。
- **最新控制映射表**：
  | 控制物理量 | 操作方式 | 映射参数/轴/按键 | 默认限速 | 加速模式限速 (RB) |
  |---|---|---|---|---|
  | **前后移动 (`linear.x`)** | 左摇杆上下 | Axis 1 (`axis_linear.x: 1`) | 0.5 m/s | 1.0 m/s |
  | **转弯/旋转 (`angular.z`)** | 左摇杆左右 | Axis 0 (`axis_angular.yaw: 0`) | 1.5 rad/s | 3.0 rad/s |
  | **左右平移 (`linear.y`)** | 右摇杆左右 | Axis 3 (`axis_linear.y: 3`) | 0.5 m/s | 1.0 m/s |
  | **安全使能** | 按住 LB 键 | Button 4 (`enable_button: 4`) | - | - |
  | **提速 Turbo** | 按住 RB 键 | Button 5 (`enable_turbo_button: 5`) | - | - |

### 2.4 麦轮运动学参数与校验同步
- 补充运动学参数更新说明：$lx = 0.0675\text{ m}$，$ly = 0.08231\text{ m}$，投影和 $lx + ly =$ **`0.14981 m`**。

### 2.5 排版规范治理 (`/chinese-documentation`)
- **中英文与数字空格**：严格保证中英文之间、中文与数字之间均有 1 个半角空格。
- **标点符号**：中文语境使用全角标点，代码/英文语境使用半角标点。
- **单位格式**：保持 `m/s`、`rad/s`、`Hz`、`V` 等单位排版规范。

---

## 3. 规格自检

1. **占位符检查**：已确认无 `TODO` 或未定义字段。
2. **内部一致性**：架构图、节点表、话题表与新增手柄小节中的话题名及节点名完全一致。
3. **范围检查**：仅针对 `docs/ROS-Jazzy通信接口.md` 文件进行文档结构提升与同步。
