# USB 摄像机 MJPEG 低延迟推流实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 树莓派 USB 摄像机经 `ustreamer` 以 MJPEG-HTTP 推到 topside `MapCameraView`，默认低延迟、可切高清，并由 `smartcar.launch.py`（`use_camera` 默认 true）在实机启动时拉起。

**架构：** 视频旁路 ROS/rosbridge；`ustreamer` 提供 `/stream`。优先双实例双端口（8080/8081）；若 UVC 无法双开，退化为单实例 + 质量切换控制口（8082）重启 `ustreamer`。上位机用 `<img>` 拉流，IP 从 rosbridge URL 解析。

**技术栈：** ROS 2 Jazzy launch、`ustreamer` 5.x、React 18、Node `node --test`

**规格：** `docs/2026-08-03-usb-camera-mjpeg-stream-design.md`

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `scripts/camera_probe_dual.sh` | 实机探测 UVC 是否允许双开 `ustreamer` |
| `scripts/camera_ustreamer_ctl.py` | （仅退化路径）单实例生命周期 + `/quality` 切换 HTTP |
| `src/smartcar_bringup/launch/camera.launch.py` | 相机推流 launch（双实例或 ctl 退化） |
| `src/smartcar_bringup/launch/smartcar.launch.py` | 增加参数并 Include `camera.launch.py` |
| `topside/src/utils/cameraStream.js` | 纯函数：从 ros URL 解析 host、拼 stream URL、重连退避 |
| `topside/src/utils/cameraStream.test.js` | 上述纯函数的 `node --test` 单测 |
| `topside/src/components/MapCameraView.jsx` | 真实 MJPEG 显示 + 档位切换 + 断流重连 |
| `topside/src/components/DashboardView.jsx` | 把 `cameraHost` 传给 `MapCameraView` |
| `topside/src/App.jsx` | 从 `connectionStatus.url` 解析 host 并下传 |
| `README.md` / `topside/README.md` / `src/smartcar_bringup/doc/验证手册.md` | 依赖、端口、验证步骤 |
| `topside/dist/**` | `npm run build` 后更新静态产物（与仓库现有惯例一致） |

---

### 任务 1：树莓派安装 ustreamer 并探测双开

**文件：**
- 创建：`scripts/camera_probe_dual.sh`

- [ ] **步骤 1：在树莓派安装 ustreamer**

说明：当前 `bean` 无免密 sudo。若代理无法交互输入密码，请用户在树莓派执行：

```bash
sudo apt update
sudo apt install -y ustreamer
ustreamer --version
```

预期：打印版本（Ubuntu noble 包约为 `5.4`）。

- [ ] **步骤 2：写入探测脚本**

```bash
#!/usr/bin/env zsh
# 探测同一 /dev/video0 是否可同时跑两个 ustreamer
set -euo pipefail
DEVICE="${1:-/dev/video0}"
pkill -f 'ustreamer --device' 2>/dev/null || true
sleep 0.5
ustreamer --device="$DEVICE" --host=127.0.0.1 --port=18080 \
  --resolution=640x480 --desired-fps=15 --format=JPEG --encoder=HW \
  --exit-on-parent-death &
PID1=$!
sleep 1
if ! kill -0 "$PID1" 2>/dev/null; then
  echo "PROBE_RESULT=FAIL_FIRST"
  exit 1
fi
ustreamer --device="$DEVICE" --host=127.0.0.1 --port=18081 \
  --resolution=1280x720 --desired-fps=10 --format=JPEG --encoder=HW \
  --exit-on-parent-death &
PID2=$!
sleep 2
if kill -0 "$PID2" 2>/dev/null; then
  echo "PROBE_RESULT=DUAL_OK"
  kill "$PID1" "$PID2" 2>/dev/null || true
  exit 0
else
  echo "PROBE_RESULT=SINGLE_ONLY"
  kill "$PID1" 2>/dev/null || true
  exit 2
fi
```

若 `--format=JPEG --encoder=HW` 失败，改试 `--format=YUYV`（CPU 编码）后重跑。

- [ ] **步骤 3：运行探测并记录结果**

```bash
chmod +x scripts/camera_probe_dual.sh
scp scripts/camera_probe_dual.sh bean@192.168.10.17:/tmp/
ssh bean@192.168.10.17 'zsh /tmp/camera_probe_dual.sh /dev/video0'
```

预期：输出 `PROBE_RESULT=DUAL_OK` 或 `PROBE_RESULT=SINGLE_ONLY`。

- [ ] **步骤 4：Commit 探测脚本**

```bash
git add scripts/camera_probe_dual.sh
git commit -m "chore(camera): 添加 ustreamer 双开探测脚本"
```

---

### 任务 2A：（仅当 DUAL_OK）双实例 camera launch

**文件：**
- 创建：`src/smartcar_bringup/launch/camera.launch.py`
- 修改：`src/smartcar_bringup/launch/smartcar.launch.py`
- 修改：`src/smartcar_bringup/CMakeLists.txt`（确认 launch 安装规则已包含 `launch/*.py`）

- [ ] **步骤 1：实现 `camera.launch.py`（双实例）**

```python
"""启动两个 ustreamer：8080 低延迟、8081 高清。"""
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, ExecuteProcess
from launch.substitutions import LaunchConfiguration


def generate_launch_description():
    args = [
        DeclareLaunchArgument("camera_device", default_value="/dev/video0"),
        DeclareLaunchArgument("camera_low_port", default_value="8080"),
        DeclareLaunchArgument("camera_high_port", default_value="8081"),
    ]
    device = LaunchConfiguration("camera_device")
    low_port = LaunchConfiguration("camera_low_port")
    high_port = LaunchConfiguration("camera_high_port")

    common = [
        "ustreamer",
        "--device=", device,  # 注意：ExecuteProcess 对 Substitution 的拼接方式见步骤说明
    ]
    # 实际实现用 PythonExpression 或把整条 cmd 用 list[str|Substitution]：
    # ExecuteProcess(
    #   cmd=['ustreamer', '--device', device, '--host', '0.0.0.0',
    #        '--port', low_port, '--resolution', '640x480',
    #        '--desired-fps', '30', '--format', 'JPEG', '--encoder', 'HW',
    #        '--host', '0.0.0.0', '--allow-origin', '*',
    #        '--exit-on-parent-death', '--slowdown'],
    #   output='screen', name='ustreamer_low',
    # )
    # high: resolution 1280x720, fps 15, port high_port, name=ustreamer_high
    return LaunchDescription(args + [/* low, high */])
```

实现时核对：`ExecuteProcess` 的 `cmd` 列表元素可以是 `LaunchConfiguration`；`--host` 必须为 `0.0.0.0`；加上 `--allow-origin=*`、`--exit-on-parent-death`、`--slowdown`。

- [ ] **步骤 2：在 `smartcar.launch.py` 增加参数并 Include**

新增参数默认值：

- `use_camera` = `true`
- `camera_device` = `/dev/video0`
- `camera_low_port` = `8080`
- `camera_high_port` = `8081`

Include 条件（同时满足实机 + 开关）：

```python
from launch.substitutions import PythonExpression
from launch.conditions import IfCondition

camera_launch = IncludeLaunchDescription(
    PythonLaunchDescriptionSource(
        PathJoinSubstitution([pkg_share, "launch", "camera.launch.py"])
    ),
    condition=IfCondition(
        PythonExpression([
            "'", use_camera, "' == 'true' and '",
            use_mock_hardware, "' == 'false'",
        ])
    ),
    launch_arguments={
        "camera_device": camera_device,
        "camera_low_port": camera_low_port,
        "camera_high_port": camera_high_port,
    }.items(),
)
```

更新文件头注释中的启动内容列表。

- [ ] **步骤 3：本地编译 bringup 包**

```bash
cd /mnt/d/Projects/smart_car_robot/scripts && ./build.sh
# 或：colcon build --packages-select smartcar_bringup --symlink-install
source /mnt/d/Projects/smart_car_robot/install/setup.zsh
```

预期：编译成功。

- [ ] **步骤 4：Commit**

```bash
git add src/smartcar_bringup/launch/camera.launch.py \
        src/smartcar_bringup/launch/smartcar.launch.py
git commit -m "feat(bringup): 实机默认启动双档 ustreamer 摄像机推流"
```

---

### 任务 2B：（仅当 SINGLE_ONLY）单实例 + 质量切换控制

**文件：**
- 创建：`scripts/camera_ustreamer_ctl.py`
- 创建：`src/smartcar_bringup/launch/camera.launch.py`
- 修改：`src/smartcar_bringup/launch/smartcar.launch.py`（同 2A 的参数与 Include）

- [ ] **步骤 1：实现 `camera_ustreamer_ctl.py`**

行为约定：

- 启动时拉起 `ustreamer`：默认 low（640x480@30），`--host 0.0.0.0 --port <stream_port>`
- 监听 `0.0.0.0:<ctl_port>`（默认 8082）
- `GET /quality?mode=low|high` → 停旧进程 → 起新分辨率 → 返回 `{"ok":true,"mode":"..."}`
- `GET /health` → `{"ok":true,"mode":"...","pid":N}`
- SIGTERM 时杀死子进程并退出
- 使用标准库 `http.server`，解释器优先 `~/Documents/ros2_venv/bin/python3`，否则 `/usr/bin/python3`

高清档：1280x720@15。格式优先 `JPEG`+`HW`，失败回退 `YUYV`。

- [ ] **步骤 2：`camera.launch.py` 只启动 ctl**

```python
ExecuteProcess(
    cmd=[
        "/home/bean/Documents/ros2_venv/bin/python3",  # 可用 FindExecutable 或参数覆盖
        PathJoinSubstitution([FindPackageShare("smartcar_bringup"), "..", "..", "..", "scripts", "camera_ustreamer_ctl.py"]),
    ],
    ...
)
```

注意：脚本在仓库根 `scripts/`，不在 ROS 包内。更稳妥做法：

1. 把 `camera_ustreamer_ctl.py` 安装进 `smartcar_bringup` 的 `share` 或 `lib`，或
2. `ExecuteProcess` 使用绝对路径参数 `camera_ctl_script` 默认指向工作空间 `scripts/camera_ustreamer_ctl.py`。

推荐：将 ctl 脚本放到 `src/smartcar_bringup/scripts/camera_ustreamer_ctl.py` 并在 `CMakeLists.txt` 里 `install(PROGRAMS ...)`，launch 用 `FindPackageShare` + `scripts/camera_ustreamer_ctl.py`。

- [ ] **步骤 3：实机手动验证切换**

```bash
python3 scripts/camera_ustreamer_ctl.py --device /dev/video0 --stream-port 8080 --ctl-port 8082
curl -s http://127.0.0.1:8082/health
curl -s 'http://127.0.0.1:8082/quality?mode=high'
curl -sI http://127.0.0.1:8080/stream | head
```

预期：`/stream` 返回 `multipart/x-mixed-replace` 或 `200`；切 high 后仍可拉流。

- [ ] **步骤 4：接入 smartcar.launch.py（同 2A 步骤 2）并编译、Commit**

```bash
git add src/smartcar_bringup/scripts/camera_ustreamer_ctl.py \
        src/smartcar_bringup/launch/camera.launch.py \
        src/smartcar_bringup/launch/smartcar.launch.py \
        src/smartcar_bringup/CMakeLists.txt
git commit -m "feat(bringup): 单实例 ustreamer 质量切换推流（UVC 双开不可用）"
```

---

### 任务 3：上位机纯函数 + 单测（TDD）

**文件：**
- 创建：`topside/src/utils/cameraStream.js`
- 创建：`topside/src/utils/cameraStream.test.js`

- [ ] **步骤 1：编写失败的测试**

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hostFromRosUrl,
  buildStreamUrl,
  buildQualityCtlUrl,
  nextReconnectDelayMs,
} from './cameraStream.js';

describe('hostFromRosUrl', () => {
  it('parses ws url', () => {
    assert.equal(hostFromRosUrl('ws://192.168.10.17:9090'), '192.168.10.17');
  });
  it('falls back on bad input', () => {
    assert.equal(hostFromRosUrl(''), '192.168.10.17');
  });
});

describe('buildStreamUrl', () => {
  it('low uses 8080', () => {
    assert.equal(
      buildStreamUrl('192.168.10.17', 'low'),
      'http://192.168.10.17:8080/stream'
    );
  });
  it('high uses 8081 in dual mode', () => {
    assert.equal(
      buildStreamUrl('192.168.10.17', 'high', { mode: 'dual' }),
      'http://192.168.10.17:8081/stream'
    );
  });
  it('high uses 8080 with cache buster in single mode', () => {
    const url = buildStreamUrl('192.168.10.17', 'high', {
      mode: 'single',
      cacheBust: 123,
    });
    assert.equal(url, 'http://192.168.10.17:8080/stream?t=123');
  });
});

describe('buildQualityCtlUrl', () => {
  it('builds ctl url', () => {
    assert.equal(
      buildQualityCtlUrl('192.168.10.17', 'high'),
      'http://192.168.10.17:8082/quality?mode=high'
    );
  });
});

describe('nextReconnectDelayMs', () => {
  it('caps at 8000', () => {
    assert.equal(nextReconnectDelayMs(0), 1000);
    assert.equal(nextReconnectDelayMs(1), 2000);
    assert.equal(nextReconnectDelayMs(2), 4000);
    assert.equal(nextReconnectDelayMs(10), 8000);
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
cd topside && node --test src/utils/cameraStream.test.js
```

预期：FAIL（模块不存在）。

- [ ] **步骤 3：实现 `cameraStream.js`**

```js
export function hostFromRosUrl(rosUrl, fallback = '192.168.10.17') {
  try {
    const normalized = String(rosUrl || '').replace(/^ws:/i, 'http:');
    const host = new URL(normalized).hostname;
    return host || fallback;
  } catch {
    return fallback;
  }
}

export function buildStreamUrl(host, quality, options = {}) {
  const mode = options.mode || 'dual';
  const lowPort = options.lowPort || 8080;
  const highPort = options.highPort || 8081;
  const port = quality === 'high' && mode === 'dual' ? highPort : lowPort;
  const base = `http://${host}:${port}/stream`;
  if (mode === 'single' && options.cacheBust != null) {
    return `${base}?t=${options.cacheBust}`;
  }
  return base;
}

export function buildQualityCtlUrl(host, quality, ctlPort = 8082) {
  return `http://${host}:${ctlPort}/quality?mode=${quality}`;
}

export function nextReconnectDelayMs(attempt) {
  return Math.min(8000, 1000 * 2 ** Math.max(0, attempt));
}
```

- [ ] **步骤 4：运行测试确认通过**

```bash
cd topside && node --test src/utils/cameraStream.test.js
```

预期：全部 PASS。

- [ ] **步骤 5：Commit**

```bash
git add topside/src/utils/cameraStream.js topside/src/utils/cameraStream.test.js
git commit -m "feat(上位机): 添加摄像机流 URL 工具函数与单测"
```

---

### 任务 4：MapCameraView 接入真实流

**文件：**
- 修改：`topside/src/components/MapCameraView.jsx`
- 修改：`topside/src/components/DashboardView.jsx`
- 修改：`topside/src/App.jsx`

- [ ] **步骤 1：App → Dashboard 下传 `cameraHost`**

`App.jsx`：

```jsx
import { hostFromRosUrl } from './utils/cameraStream';
// ...
const cameraHost = hostFromRosUrl(connectionStatus.url || rosService.url);
// ...
{activeTab === 'DASHBOARD' && (
  <DashboardView telemetry={telemetry} cameraHost={cameraHost} />
)}
```

`DashboardView.jsx`：

```jsx
export default function DashboardView({ telemetry, cameraHost }) {
  // ...
  <MapCameraView odomX={odomX} odomY={odomY} cameraHost={cameraHost} />
}
```

- [ ] **步骤 2：替换摄像机占位为 `<img>` + 档位按钮**

要点：

- props：`cameraHost`（必填有默认）、可选 `streamMode: 'dual'|'single'`（可用常量，与任务 1 探测结果一致；默认按探测结果写死或 `import.meta.env` / 前端常量 `CAMERA_STREAM_MODE`）
- state：`quality` 默认 `'low'`；`streamOk`；`reconnectAttempt`；`cacheBust`
- `streamUrl = buildStreamUrl(cameraHost, quality, { mode, cacheBust })`
- 切到 high 且 `mode==='single'` 时：先 `fetch(buildQualityCtlUrl(...))`，再 `setCacheBust(Date.now())`
- `<img src={streamUrl} alt="camera" onLoad=... onError=... />`，`onError` 用 `nextReconnectDelayMs` 定时把 `cacheBust` 刷新以重连
- 保留地图逻辑不变

前端常量建议放在 `cameraStream.js`：

```js
export const CAMERA_STREAM_MODE = 'dual'; // 或 'single'，与任务 1 结果一致
```

- [ ] **步骤 3：本地 `npm run build` 更新 dist**

```bash
cd topside && npm run build
```

- [ ] **步骤 4：Commit**

```bash
git add topside/src/App.jsx topside/src/components/DashboardView.jsx \
        topside/src/components/MapCameraView.jsx topside/src/utils/cameraStream.js \
        topside/dist
git commit -m "feat(上位机): MapCameraView 接入 MJPEG 实时画面与档位切换"
```

---

### 任务 5：文档

**文件：**
- 修改：`README.md`
- 修改：`topside/README.md`
- 修改：`src/smartcar_bringup/doc/验证手册.md`
- 修改：`docs/2026-08-03-usb-camera-mjpeg-stream-design.md`（若走了退化路径，更新双开结论）

- [ ] **步骤 1：根 README**

补充：

- 硬件表可加一行 USB 摄像机
- 依赖：`sudo apt install -y ustreamer`
- launch 参数：`use_camera`、`camera_device`、端口
- 端口：`8080`（及 `8081` 或 ctl `8082`）
- 路线图勾选摄像机推流项

- [ ] **步骤 2：topside README**

通信表增加摄像机 HTTP 流说明（非 ROS 话题）；说明档位切换。

- [ ] **步骤 3：验证手册增加「摄像机推流」一节**

```bash
# 实机
ros2 launch smartcar_bringup smartcar.launch.py use_mock_hardware:=false
curl -sI http://127.0.0.1:8080/stream | head
# 上位机浏览器打开摄像机页，确认出图与档位切换
```

- [ ] **步骤 4：Commit**

```bash
git add README.md topside/README.md src/smartcar_bringup/doc/验证手册.md \
        docs/2026-08-03-usb-camera-mjpeg-stream-design.md
git commit -m "docs(camera): 补充摄像机推流依赖与验证步骤"
```

---

### 任务 6：部署到树莓派并联调至通过

**文件：** 无新文件（pull + 运行）

- [ ] **步骤 1：推送并在树莓派拉取**

```bash
# 开发机（需用户明确要求 push 时再执行；若已授权则 push）
git push -u origin HEAD

# 树莓派
ssh bean@192.168.10.17
cd ~/projects/smart_car_robot
git pull
# 若 bringup 有变更：
cd scripts && ./build.sh
source ~/projects/smart_car_robot/install/setup.zsh
```

- [ ] **步骤 2：实机启动**

```bash
ros2 launch smartcar_bringup smartcar.launch.py use_mock_hardware:=false
```

预期：日志出现 ustreamer 或 camera_ustreamer_ctl；`curl -sI http://192.168.10.17:8080/stream` 从 WSL2 可通。

- [ ] **步骤 3：上位机验证**

```bash
cd topside && node server/index.js
# 浏览器 http://localhost:3223 → 切换摄像机 → 低延迟出图 → 切高清 → 切回
```

- [ ] **步骤 4：关闭开关回归**

```bash
ros2 launch smartcar_bringup smartcar.launch.py use_mock_hardware:=false use_camera:=false
```

预期：无推流进程；底盘/rosbridge 正常。

- [ ] **步骤 5：mock 回归**

```bash
ros2 launch smartcar_bringup smartcar.launch.py
```

预期：不启动相机、无设备错误。

- [ ] **步骤 6：若失败则修到通过，再补 commit**

按系统化调试定位（设备占用、防火墙、格式、CORS、IP 解析），修完后回归步骤 2–5。

---

## 规格覆盖自检

| 规格需求 | 对应任务 |
| --- | --- |
| topside 显示实时画面 | 任务 4、6 |
| 低延迟 / 高清切换 | 任务 2A/2B、3、4 |
| `use_camera` 默认 true | 任务 2A/2B |
| 仅实机启动 | 任务 2A/2B PythonExpression |
| 视频旁路 rosbridge | 全程 HTTP MJPEG |
| 双开失败退化 | 任务 1 → 2B |
| 断流重连 | 任务 3/4 |
| 文档 | 任务 5 |
| 实机测到通过 | 任务 6 |

---

## 执行交接

计划已保存到 `docs/2026-08-03-usb-camera-mjpeg-stream-plan.md`。

**两种执行方式：**

1. **子代理驱动（推荐）** — 每个任务调度一个新子代理，任务间审查，快速迭代  
2. **内联执行** — 在当前会话用 executing-plans 按任务推进，批量执行并设检查点  

选哪种方式？
