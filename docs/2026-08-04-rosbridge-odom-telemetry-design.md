# rosbridge `Odometry` 序列化故障修复设计规格

| 字段 | 内容 |
| --- | --- |
| 日期 | 2026-08-04 |
| 状态 | 设计已确认，待实现 |
| 路径说明 | 仓库已 ignore `docs/superpowers/`，本规格放在 `docs/` 下以便入库 |
| 目标问题 | 树莓派运行 `smartcar.launch.py` 后，网页经 `rosbridge_websocket` 订阅 `/mecanum_drive_controller/odometry` 时，持续报错：`cannot serialize type <class 'nav_msgs.msg._odometry.Odometry'>` |
| 推荐方案 | 新增 Web 遥测适配节点，将 `Odometry` 降维并重发布为 `TwistStamped` + `Pose2D`，前端改订阅新话题 |

## 1. 背景与事实

### 1.1 已确认事实

- `src/smartcar_bringup/launch/smartcar.launch.py` 会直接拉起 `rosbridge_websocket`。
- 上位机 `topside/src/services/rosbridge.js` 当前直接订阅 `/mecanum_drive_controller/odometry`，消息类型为 `nav_msgs/msg/Odometry`。
- 仅当网页连接 `ws://<树莓派 IP>:9090` 并开始订阅该话题后，树莓派日志才出现序列化报错。
- 在树莓派本机执行 `ros2 topic echo /mecanum_drive_controller/odometry --once` 可以正常打印完整消息。

### 1.2 根因判断

基于当前证据，故障不在底盘控制器，也不在 `Odometry` 的发布链路，而是在 `rosbridge_websocket` 将 `nav_msgs/msg/Odometry` 转换为 WebSocket 可传输负载时失败。

这说明系统当前把「控制器内部复杂消息」直接暴露给 Web 层，导致 Web 通信路径依赖 `rosbridge` 对复杂嵌套 ROS 消息的兼容性。该边界设计过薄，是这次故障的根本诱因。

### 1.3 成功标准

1. 网页连接 `rosbridge_websocket` 后，不再出现 `Odometry` 序列化报错。
2. 上位机继续获得速度、位置与航向等核心遥测信息。
3. `/mecanum_drive_controller/odometry` 保留给底层控制与调试使用，不被删除。
4. 改动不影响底盘控制、IMU、电池与已有 `rosbridge` 连接能力。

### 1.4 非目标

- 不修改 `mecanum_drive_controller` 内部实现。
- 不尝试直接修补或替换树莓派系统安装的 `rosbridge_suite`。
- 不引入自定义 `.msg` 类型。
- 不改动 Web 页面展示布局与交互逻辑。

## 2. 方案比较

### 2.1 方案 A：新增 Web 遥测适配层（推荐）

新增独立 ROS 节点，订阅 `/mecanum_drive_controller/odometry`，提取 Web 端真正需要的二维遥测，重发布为简单标准消息：

- `/web/telemetry/twist` → `geometry_msgs/msg/TwistStamped`
- `/web/telemetry/pose2d` → `geometry_msgs/msg/Pose2D`

前端不再直接订阅 `Odometry`，改为订阅上述新话题。

**优点：**

- 从架构边界上隔离 `rosbridge` 对复杂消息的兼容风险。
- 仅使用标准消息，构建链简单。
- 前端所需数据更清晰，带宽与解析成本更低。

**缺点：**

- 需要新增一个适配节点。
- 前端订阅话题名称需要同步调整。

### 2.2 方案 B：升级或修补 `rosbridge_suite`

保留当前订阅关系，直接处理树莓派系统中的 `rosbridge` 兼容问题。

**优点：**

- 前端代码几乎无需改动。

**缺点：**

- 依赖树莓派系统环境与 Jazzy 软件包状态。
- 若为发行版兼容缺陷，验证与回归成本高。
- 即使修好这次问题，后续其他复杂消息仍可能重复踩坑。

### 2.3 方案 C：`Odometry` 原样中继

新增中继节点，重新构造一个新的 `Odometry` 实例并重发到新话题，让前端改订阅中继话题。

**优点：**

- 前端字段访问逻辑几乎不变。

**缺点：**

- 如果 `rosbridge` 不能稳定序列化 `Odometry` 类型本身，该方案仍会失败。
- 不能从根本上收敛 Web 层的数据边界。

### 2.4 结论

采纳 **方案 A**。理由不是规避问题，而是明确划分系统边界：

- 底层控制链保留完整 `Odometry`
- Web 遥测链只消费最小完备二维状态

这样才能从根因上消除「Web 依赖复杂控制器内部消息结构」这一设计缺陷。

## 3. 架构设计

```text
/mecanum_drive_controller/odometry (nav_msgs/msg/Odometry)
                     │
                     ▼
┌──────────────────────────────────────────────┐
│ web_telemetry_adapter                        │
│ - 订阅 Odometry                               │
│ - 提取 vx / vy / wz                           │
│ - 提取 x / y / yaw                            │
│ - 防御性处理空字段与异常姿态                  │
└──────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
/web/telemetry/twist            /web/telemetry/pose2d
(geometry_msgs/TwistStamped)    (geometry_msgs/Pose2D)
          │                              │
          └──────────────┬───────────────┘
                         ▼
                rosbridge_websocket
                         ▼
               topside `rosbridge.js`
```

### 3.1 设计原则

1. **控制接口与 Web 接口分离**：控制器内部接口不直接暴露给 Web。
2. **最小完备数据集**：只发布上位机真实需要的数据，避免无用嵌套结构。
3. **标准消息优先**：优先复用 ROS 标准消息，降低构建与联调复杂度。
4. **失败隔离**：即便 Web 适配链异常，也不拖垮底盘控制主链。

## 4. 话题与消息设计

### 4.1 输入话题

| 话题 | 类型 | 来源 | 用途 |
| --- | --- | --- | --- |
| `/mecanum_drive_controller/odometry` | `nav_msgs/msg/Odometry` | `mecanum_drive_controller` | 原始底盘里程计输入 |

### 4.2 输出话题

| 话题 | 类型 | 字段 | 说明 |
| --- | --- | --- | --- |
| `/web/telemetry/twist` | `geometry_msgs/msg/TwistStamped` | `twist.linear.x/y`，`twist.angular.z` | Web 端速度遥测 |
| `/web/telemetry/pose2d` | `geometry_msgs/msg/Pose2D` | `x`，`y`，`theta` | Web 端平面位姿遥测 |

### 4.3 字段映射

| `Odometry` 字段 | 输出话题字段 | 说明 |
| --- | --- | --- |
| `twist.twist.linear.x` | `/web/telemetry/twist.twist.linear.x` | 前后线速度 |
| `twist.twist.linear.y` | `/web/telemetry/twist.twist.linear.y` | 左右线速度 |
| `twist.twist.angular.z` | `/web/telemetry/twist.twist.angular.z` | 平面角速度 |
| `pose.pose.position.x` | `/web/telemetry/pose2d.x` | 平面 X 坐标 |
| `pose.pose.position.y` | `/web/telemetry/pose2d.y` | 平面 Y 坐标 |
| `pose.pose.orientation` | `/web/telemetry/pose2d.theta` | 四元数解算出的平面 yaw |

### 4.4 航向角计算

`theta` 使用四元数转 yaw 的标准平面公式：

```text
yaw = atan2(2 * (w * z + x * y), 1 - 2 * (y^2 + z^2))
```

该节点只输出二维平面航向，不承担完整 3D 姿态语义。

## 5. 节点职责与接口边界

### 5.1 新增节点职责

新节点只做以下工作：

1. 订阅 `Odometry`
2. 解析并提取 Web 所需字段
3. 发布两个轻量标准话题

明确不做以下工作：

- 不修改控制器发布频率
- 不缓存历史轨迹
- 不做 WebSocket 服务
- 不做前端展示逻辑

### 5.2 Launch 集成

- `smartcar.launch.py` 增加该适配节点。
- `rosbridge_websocket` 维持现有启动方式。
- 上位机仍连接 `ws://<树莓派 IP>:9090`，仅更换订阅目标。

### 5.3 前端改动边界

`topside/src/services/rosbridge.js` 需要改动：

- 删除 `/mecanum_drive_controller/odometry` 订阅
- 新增 `/web/telemetry/twist` 订阅
- 新增 `/web/telemetry/pose2d` 订阅
- 将现有 `telemetry.linearX / linearY / angularZ / odomX / odomY` 赋值逻辑切换到新话题
- 如需显示航向，可额外接入 `theta`

前端页面组件本身不需要重构。

## 6. 防御性设计

### 6.1 输入校验

适配节点必须对以下场景做防御性处理：

- `message` 为空
- `pose` 或 `twist` 子字段不存在
- 四元数字段缺失
- 四元数数值异常导致 yaw 计算不可用

处理策略：

- 缺失字段统一降级为 `0`
- 记录一次可读日志
- 节点持续运行，不抛出未处理异常

### 6.2 失败隔离

| 异常场景 | 处理行为 |
| --- | --- |
| 适配节点未启动 | 前端该路遥测为空值，但底盘控制不受影响 |
| `Odometry` 暂时中断 | 新话题停止更新，但节点不崩溃 |
| `rosbridge` 对新话题仍异常 | 问题被局限在简单标准消息路径，便于进一步定位 |

## 7. 测试与验证策略

### 7.1 验证顺序

1. 启动修改后的 bringup。
2. 用 `ros2 topic echo` 验证：
   - `/web/telemetry/twist`
   - `/web/telemetry/pose2d`
3. 确认树莓派日志不再出现 `Odometry` 序列化异常。
4. 打开上位机网页，确认速度与位置恢复。
5. 冒烟验证电池、IMU、控制指令等其他链路不受影响。

### 7.2 回归重点

- `/mecanum_drive_controller/odometry` 仍正常发布
- `rosbridge_websocket` 仍可连接
- `publishCmdVel()` 控制链不受影响
- 仪表盘实时数值与运动方向保持一致

## 8. 被否决的方案

| 方案 | 否决原因 |
| --- | --- |
| 直接升级 `rosbridge_suite` | 环境依赖重、验证慢，且不解决边界设计问题 |
| 原样重发 `Odometry` | 若问题绑定在 `Odometry` 类型本身，则无法根治 |
| 自定义 `SmartcarTelemetry.msg` | 当前问题只需最小修复，引入自定义消息属于过度设计 |
| `std_msgs/String` 承载 JSON | 丢失类型系统与工具链价值，长期维护性差 |

## 9. 实现清单

- [ ] 新增 Web 遥测适配节点源码
- [ ] 在 `smartcar.launch.py` 中接入该节点
- [ ] 修改 `topside/src/services/rosbridge.js` 的订阅逻辑
- [ ] 增加针对新话题的验证步骤与文档说明
- [ ] 编译改动的 ROS 包并完成实机测试

## 10. 规格自检结论

- **占位符检查**：无 `TODO`、`TBD` 或未完成章节。
- **一致性检查**：架构、话题、前端改动与测试策略前后一致。
- **范围检查**：该规格聚焦单一问题，可由一个实现计划覆盖。
- **歧义检查**：已明确不直接修 `rosbridge`，而是通过适配层收敛系统边界。
