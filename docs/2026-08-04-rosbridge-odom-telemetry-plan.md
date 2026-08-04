# rosbridge `Odometry` 遥测适配修复实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `subagent-driven-development` 或 `executing-plans` 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 通过新增 Web 遥测适配节点，绕开 `rosbridge_websocket` 对完整 `nav_msgs/msg/Odometry` 的序列化故障，同时保持底盘控制链与原始里程计话题不变。

**架构：** `web_telemetry_adapter` 订阅 `/mecanum_drive_controller/odometry`，将速度转换为 `geometry_msgs/msg/TwistStamped`，将二维位置和 yaw 转换为 `geometry_msgs/msg/Pose2D`。`smartcar.launch.py` 拉起适配节点，网页改订阅两个新话题。

**技术栈：** ROS 2 Jazzy、Python、`rclpy`、`nav_msgs`、`geometry_msgs`、ROS 2 launch、React、`roslib`。

---

## 文件清单

- 创建：`src/smartcar_bringup/scripts/web_telemetry_adapter.py`
  - 独立 ROS 2 节点，负责 `Odometry` 到 Web 遥测消息的转换。
- 创建：`src/smartcar_bringup/test/test_web_telemetry_adapter.py`
  - 不依赖 ROS 节点运行时的纯函数测试，覆盖字段提取、yaw 计算和异常输入。
- 修改：`src/smartcar_bringup/CMakeLists.txt`
  - 安装适配节点，并在构建测试阶段注册 Python 单元测试。
- 修改：`src/smartcar_bringup/package.xml`
  - 声明 `rclpy`、`nav_msgs`、`geometry_msgs` 和测试依赖。
- 修改：`src/smartcar_bringup/launch/smartcar.launch.py`
  - 在现有底盘启动链中拉起适配节点。
- 修改：`topside/src/services/rosbridge.js`
  - 将 `Odometry` 订阅替换为两个 Web 遥测话题订阅。
- 修改：`src/smartcar_bringup/doc/验证手册.md`
  - 增加新话题、序列化和网页遥测验证步骤。

### 任务 1：先建立转换逻辑的失败测试

**文件：**

- 创建：`src/smartcar_bringup/test/test_web_telemetry_adapter.py`

- [ ] **步骤 1：编写可独立运行的测试夹具**

测试文件必须只测试纯转换函数，不启动 ROS 节点。测试夹具使用简单对象模拟消息字段，避免本机未安装 ROS 时无法先验证数学逻辑。

```python
import math
import unittest
from types import SimpleNamespace

from web_telemetry_adapter import extract_telemetry


def make_odometry(x, y, yaw, linear_x, linear_y, angular_z):
    half_yaw = yaw / 2.0
    return SimpleNamespace(
        pose=SimpleNamespace(
            pose=SimpleNamespace(
                position=SimpleNamespace(x=x, y=y),
                orientation=SimpleNamespace(
                    x=0.0,
                    y=0.0,
                    z=math.sin(half_yaw),
                    w=math.cos(half_yaw),
                ),
            )
        ),
        twist=SimpleNamespace(
            twist=SimpleNamespace(
                linear=SimpleNamespace(x=linear_x, y=linear_y),
                angular=SimpleNamespace(z=angular_z),
            )
        ),
    )


class TelemetryExtractionTest(unittest.TestCase):
    def test_extracts_planar_pose_and_velocity(self):
        result = extract_telemetry(make_odometry(1.2, -0.4, 0.75, 0.3, -0.2, 1.1))

        self.assertAlmostEqual(result["x"], 1.2)
        self.assertAlmostEqual(result["y"], -0.4)
        self.assertAlmostEqual(result["yaw"], 0.75)
        self.assertAlmostEqual(result["linear_x"], 0.3)
        self.assertAlmostEqual(result["linear_y"], -0.2)
        self.assertAlmostEqual(result["angular_z"], 1.1)

    def test_missing_nested_fields_fall_back_to_zero(self):
        result = extract_telemetry(SimpleNamespace())

        self.assertEqual(result, {
            "x": 0.0,
            "y": 0.0,
            "yaw": 0.0,
            "linear_x": 0.0,
            "linear_y": 0.0,
            "angular_z": 0.0,
        })

    def test_zero_quaternion_has_zero_yaw(self):
        message = make_odometry(0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        message.pose.pose.orientation.x = 0.0
        message.pose.pose.orientation.y = 0.0
        message.pose.pose.orientation.z = 0.0
        message.pose.pose.orientation.w = 0.0

        result = extract_telemetry(message)

        self.assertEqual(result["yaw"], 0.0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **步骤 2：运行测试确认当前失败**

运行：

```bash
PYTHONPATH=src/smartcar_bringup/scripts \
python3 -m unittest discover -s src/smartcar_bringup/test -v
```

预期：测试因 `web_telemetry_adapter` 尚不存在而失败，不能跳过该失败证据。

### 任务 2：实现适配节点与防御性转换

**文件：**

- 创建：`src/smartcar_bringup/scripts/web_telemetry_adapter.py`

- [ ] **步骤 1：实现纯函数与默认值**

实现以下稳定接口：

```python
def extract_telemetry(message) -> dict[str, float]:
    """从 Odometry 提取二维位置、速度和 yaw。"""


def quaternion_to_yaw(orientation) -> float:
    """将四元数转换为平面 yaw；非法输入返回 0.0。"""
```

实现要求：

- 所有输出字段固定为 `x`、`y`、`yaw`、`linear_x`、`linear_y`、`angular_z`。
- 缺失 `message`、`pose`、`twist` 或子字段时返回对应 `0.0`。
- 四元数全零、字段缺失、字段不是有限数值时返回 `0.0`。
- 使用 `math.isfinite()` 拒绝 NaN 和无穷大。
- 不在纯函数中打印日志，避免高频话题产生重复日志。

- [ ] **步骤 2：实现 ROS 2 节点**

节点结构必须保持单一职责：

```python
class WebTelemetryAdapter(Node):
    """将底盘 Odometry 转换为 Web 遥测标准消息。"""

    def __init__(self):
        super().__init__("web_telemetry_adapter")
        self.twist_publisher = self.create_publisher(
            TwistStamped,
            "/web/telemetry/twist",
            10,
        )
        self.pose_publisher = self.create_publisher(
            Pose2D,
            "/web/telemetry/pose2d",
            10,
        )
        self.subscription = self.create_subscription(
            Odometry,
            "/mecanum_drive_controller/odometry",
            self.odometry_callback,
            10,
        )
```

回调要求：

- `TwistStamped.header` 复制输入 `Odometry.header`。
- `TwistStamped.twist` 仅填写 `linear.x`、`linear.y` 和 `angular.z`，其他分量为 `0.0`。
- `Pose2D` 填写 `x`、`y` 和 `theta`。
- 回调异常必须被捕获并通过 ROS 日志报告，不能让订阅回调退出节点。

- [ ] **步骤 3：运行纯函数测试确认通过**

运行：

```bash
PYTHONPATH=src/smartcar_bringup/scripts \
python3 -m unittest discover -s src/smartcar_bringup/test -v
```

预期：全部测试通过。

- [ ] **步骤 4：Commit**

```bash
git add src/smartcar_bringup/scripts/web_telemetry_adapter.py \
  src/smartcar_bringup/test/test_web_telemetry_adapter.py
git commit -m "feat(遥测): 添加 Web 里程计适配节点"
```

### 任务 3：接入 ROS 包和 Launch

**文件：**

- 修改：`src/smartcar_bringup/CMakeLists.txt`
- 修改：`src/smartcar_bringup/package.xml`
- 修改：`src/smartcar_bringup/launch/smartcar.launch.py`

- [ ] **步骤 1：补齐运行期依赖**

在 `package.xml` 增加：

```xml
<exec_depend>rclpy</exec_depend>
<exec_depend>nav_msgs</exec_depend>
<exec_depend>geometry_msgs</exec_depend>
<test_depend>python3-pytest</test_depend>
```

- [ ] **步骤 2：安装节点和测试**

在 `CMakeLists.txt` 中将适配脚本加入现有 `install(PROGRAMS ...)`，并增加：

```cmake
if(BUILD_TESTING)
  find_package(ament_cmake_pytest REQUIRED)
  ament_add_pytest_test(
    test_web_telemetry_adapter
    test/test_web_telemetry_adapter.py
  )
endif()
```

- [ ] **步骤 3：在 Launch 中拉起节点**

在 `smartcar.launch.py` 增加：

```python
web_telemetry_adapter = Node(
    package="smartcar_bringup",
    executable="web_telemetry_adapter.py",
    output="both",
)
```

将该节点放入最终 `LaunchDescription`，且不改变现有 `rosbridge_websocket`、控制器和相机节点的启动条件。

- [ ] **步骤 4：检查资源安装路径**

确认安装后以下命令能找到节点：

```bash
ros2 pkg prefix smartcar_bringup
ros2 run smartcar_bringup web_telemetry_adapter.py
```

预期：节点启动并等待 `/mecanum_drive_controller/odometry`，不应出现 `PackageNotFound` 或 `executable not found`。

- [ ] **步骤 5：Commit**

```bash
git add src/smartcar_bringup/package.xml \
  src/smartcar_bringup/CMakeLists.txt \
  src/smartcar_bringup/launch/smartcar.launch.py
git commit -m "feat(启动): 接入 Web 遥测适配节点"
```

### 任务 4：切换上位机订阅

**文件：**

- 修改：`topside/src/services/rosbridge.js`

- [ ] **步骤 1：替换 `Odometry` 订阅**

删除原 `/mecanum_drive_controller/odometry` 订阅，新增两个订阅：

```javascript
this.topics.telemetryTwist = new ROSLIB.Topic({
  ros: this.ros,
  name: '/web/telemetry/twist',
  messageType: 'geometry_msgs/msg/TwistStamped'
});

this.topics.telemetryPose = new ROSLIB.Topic({
  ros: this.ros,
  name: '/web/telemetry/pose2d',
  messageType: 'geometry_msgs/msg/Pose2D'
});
```

- [ ] **步骤 2：保持现有遥测状态字段**

速度回调继续写入：

```javascript
this.telemetry.linearX = message.twist?.linear?.x || 0;
this.telemetry.linearY = message.twist?.linear?.y || 0;
this.telemetry.angularZ = message.twist?.angular?.z || 0;
```

位置回调写入：

```javascript
this.telemetry.odomX = message.x || 0;
this.telemetry.odomY = message.y || 0;
```

如果接入 `theta`，只新增状态字段，不改变现有页面布局。

- [ ] **步骤 3：避免重复订阅**

确认 `setupSubscriptions()` 每次重连只创建一组订阅；在重新连接前关闭旧 ROS 连接，不能让相同话题的回调累计。

- [ ] **步骤 4：运行前端静态检查**

运行：

```bash
cd topside
npm run build
```

预期：构建成功，且源码中不再出现对 `/mecanum_drive_controller/odometry` 的 `ROSLIB.Topic` 订阅。

- [ ] **步骤 5：Commit**

```bash
git add topside/src/services/rosbridge.js
git commit -m "fix(上位机): 切换到 Web 遥测话题"
```

### 任务 5：ROS 构建、集成验证与文档更新

**文件：**

- 修改：`src/smartcar_bringup/doc/验证手册.md`

- [ ] **步骤 1：编译改动的 ROS 包**

在已加载 ROS 2 Jazzy 环境的工作区根目录运行：

```bash
colcon build --packages-select smartcar_bringup --symlink-install
```

预期：`smartcar_bringup` 编译成功。

- [ ] **步骤 2：运行包内测试**

运行：

```bash
colcon test --packages-select smartcar_bringup
colcon test-result --verbose
```

预期：`test_web_telemetry_adapter` 通过，测试结果无失败项。

- [ ] **步骤 3：验证新话题**

启动：

```bash
ros2 launch smartcar_bringup smartcar.launch.py \
  use_mock_hardware:=false \
  use_camera:=false
```

另开终端分别运行：

```bash
ros2 topic echo /web/telemetry/twist --once
ros2 topic echo /web/telemetry/pose2d --once
ros2 topic echo /mecanum_drive_controller/odometry --once
```

预期：

- 3 个话题都能正常输出。
- 原始 `Odometry` 话题保持可用。
- `rosbridge_websocket` 日志不再出现 `cannot serialize type ... Odometry`。

- [ ] **步骤 4：验证网页连接**

打开上位机网页并连接树莓派 `9090` 端口，确认：

- 速度面板实时更新。
- 轨迹位置实时更新。
- 电池、IMU 和控制指令仍正常。
- 树莓派终端不再持续打印 `Odometry` 序列化异常。

- [ ] **步骤 5：更新验证手册**

在 `src/smartcar_bringup/doc/验证手册.md` 增加：

- 两个 Web 遥测话题的类型和字段。
- `ros2 topic echo` 验证命令。
- 网页连接后的成功标准。
- 原始 `Odometry` 仍保留为底层调试接口的说明。

- [ ] **步骤 6：执行一致性检查**

运行：

```bash
rg -n \
  'mecanum_drive_controller/odometry|web/telemetry/(twist|pose2d)' \
  src topside docs
```

检查结果必须满足：

- 上位机不再直接订阅原始 `Odometry`。
- Launch、节点、文档中的新话题名称完全一致。
- 不存在旧方案残留的错误消息类型配置。

- [ ] **步骤 7：Commit**

```bash
git add src/smartcar_bringup/doc/验证手册.md
git commit -m "docs(验证): 补充 Web 遥测桥接验证步骤"
```

## 实现完成标准

- [ ] 纯函数测试通过。
- [ ] `smartcar_bringup` 构建通过。
- [ ] `colcon test` 无失败项。
- [ ] 新话题可以被 `ros2 topic echo` 读取。
- [ ] 网页可以正常显示速度与位置。
- [ ] 树莓派不再出现 `Odometry` 序列化错误。
- [ ] 原始控制器话题与控制指令链保持可用。
