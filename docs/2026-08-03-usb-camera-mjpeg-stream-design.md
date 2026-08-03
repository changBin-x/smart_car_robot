# USB 摄像机低延迟 MJPEG 推流设计规格

| 字段 | 内容 |
| --- | --- |
| 日期 | 2026-08-03 |
| 状态 | 已落地（SINGLE_ONLY） |
| 路径说明 | 仓库已 ignore `docs/superpowers/`，本规格放在 `docs/` 下以便入库 |
| 方案 | ustreamer MJPEG-HTTP（方案一）→ **单实例 + 质量控制口** |
| 目标 | 树莓派 USB 摄像机画面实时显示在 topside React 界面，延迟尽可能低，支持低延迟 / 高清切换 |

## 1. 背景与目标

### 1.1 现状

- 树莓派 4B（`192.168.10.17`）已连接 **1080P USB Camera**，设备节点为 `/dev/video0`。
- 上位机 `MapCameraView` 已接入 MJPEG 实时画面与档位切换（浏览器直连 HTTP 流）。
- 控制与遥测已通过 `rosbridge_websocket`（端口 `9090`）连通；视频若经 rosbridge 传 `CompressedImage`，Base64 膨胀会导致延迟与带宽不可接受。

### 1.2 成功标准

1. 上位机切换到摄像机页后，可稳定显示实时画面。
2. 默认使用低延迟档；可一键切换高清档。
3. `smartcar.launch.py` 提供 `use_camera` 开关，**默认 `true`**；实机启动时自动拉起推流。
4. 视频链路故障不影响底盘控制 / IMU / 电池等既有功能。
5. `use_camera:=false` 或 WSL2 mock 模式下不启动推流、不报错拖垮 bringup。

### 1.3 非目标（本规格不做）

- 不发布 ROS `sensor_msgs/Image` 话题（后续视觉算法可另开规格）。
- 不实现 WebRTC / RTSP 播放器。
- 不实现音频。
- 不在 WSL2 mock 环境模拟摄像头画面。

## 2. 架构

```text
USB Camera (/dev/video0)
        │
        ▼
┌──────────────────────────────────────────────┐
│  camera_ustreamer_ctl（bringup 拉起）          │
│  管理单实例 ustreamer（YUYV + CPU）            │
│  stream :0.0.0.0:8080  ──► /stream           │
│  ctl    :0.0.0.0:8082  ──► /quality?mode=…   │
│  low  = 640×480 @ 30                         │
│  high = 1280×720 @ 15                        │
└──────────────────────────────────────────────┘
        │  HTTP MJPEG（旁路，不经 ROS）
        ▼
┌──────────────────────────────────────────────┐
│  Topside MapCameraView                       │
│  <img src="http://<pi-ip>:8080/stream">      │
│  切档 = GET :8082/quality → 重启 ustreamer   │
└──────────────────────────────────────────────┘

控制 / 遥测仍走 ws://<pi-ip>:9090（rosbridge），与视频解耦。
```

### 2.1 设计原则

1. **媒体旁路**：视频走独立 HTTP 端口，与 rosbridge 解耦，从第一性原理上消除 Base64 / DDS 中转开销。
2. **单实例切档**：同一 UVC 设备只跑一个 `ustreamer`；切档经控制口停旧起新，前端短暂黑屏可接受。
3. **实机才启**：仅 `use_mock_hardware:=false` 且 `use_camera:=true` 时启动，避免 WSL2 无设备失败。

### 2.2 双开探测结论（SINGLE_ONLY）

实机运行 `scripts/camera_probe_dual.sh` 时，早期判定曾输出 `PROBE_RESULT=DUAL_OK`，属**误报**：第二路进程虽能起来，但 ustreamer `/state` 中 `source.online=false`，并未真正占用采集源。

加固探测（以 `online=true` 为准）后结论为：

| 结果 | 含义 |
| --- | --- |
| `PROBE_RESULT=SINGLE_ONLY` | **采纳**：UVC 不能真双开 |

因此落地路径固定为 **任务 2B**：`camera_ustreamer_ctl` 单实例 + `:8082` 质量切换；**不**启动双端口 `8080`/`8081` 双进程方案。

采集格式：`--format=YUYV --encoder=CPU`（JPEG+HW 路径不可用或不可靠时的稳定选择）。

## 3. 组件与接口

### 3.1 系统依赖（树莓派）

```bash
sudo apt install -y ustreamer
```

用户 `bean` 已在 `video` 组，具备 `/dev/video0` 访问权限。

### 3.2 Launch 参数（`smartcar.launch.py`）

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `use_camera` | `true` | 是否启用摄像机推流 |
| `camera_device` | `/dev/video0` | V4L2 设备路径 |
| `camera_stream_port` | `8080` | MJPEG 推流端口 |
| `camera_ctl_port` | `8082` | 质量切换 HTTP 控制端口 |

启动条件：`UnlessCondition(use_mock_hardware)` **且** `IfCondition(use_camera)`。

实现方式：`ExecuteProcess` 调用包内 `scripts/camera_ustreamer_ctl.py`（由 `camera.launch.py` / bringup 共享），不另起双 `ustreamer` 进程。

等效命令形态：

```bash
# 由 camera_ustreamer_ctl 托管的 ustreamer（默认 low）
ustreamer --device /dev/video0 --host 0.0.0.0 --port 8080 \
  --resolution 640x480 --desired-fps 30 \
  --format=YUYV --encoder=CPU --allow-origin=* --slowdown
```

拉流与切档 URL：

- 画面：`http://<pi-ip>:8080/stream`
- 切档：`http://<pi-ip>:8082/quality?mode=low|high`
- 健康：`http://<pi-ip>:8082/health`

### 3.3 上位机（`MapCameraView.jsx`）

1. 有流则显示 `<img>`；断流显示提示并退避重连。
2. `streamUrl` 由导航栏已配置的树莓派 IP + 端口 `8080` 组成（`CAMERA_STREAM_MODE = 'single'`）。
3. UI 提供「低延迟 / 高清」切换；默认低延迟。切档时先请求 `:8082/quality`，再刷新 `<img>`（可带 `?t=` 缓存破坏）。
4. `<img onError>`：指数退避重连（例如 1 s → 2 s → 4 s，上限 8 s）。
5. **不经 Node 后端代理**，浏览器直连树莓派，降低一跳延迟。
6. 若浏览器因混合内容限制无法加载（HTTPS 页拉 HTTP 流），文档中说明 topside 以 `http://localhost:3223` 访问；本项目当前为 HTTP 本地服务，无此问题。

### 3.4 文档更新范围

- 根目录 `README.md`：硬件表、依赖、端口、`use_camera` 参数、路线图。
- `topside/README.md`：摄像机 HTTP 流 URL、档位切换（非 ROS 话题）。
- `src/smartcar_bringup/doc/验证手册.md`：摄像机推流验证节。

## 4. 错误处理

| 场景 | 行为 |
| --- | --- |
| `/dev/video0` 不存在或无权限 | ctl / ustreamer 退出并打日志；控制栈继续；上位机显示断流提示 |
| 网络抖动 / 瞬时断流 | `onError` + 退避重连 |
| 8080 / 8082 端口占用 | 对应进程启动失败，日志明确端口冲突 |
| UVC 不能双开（已确认 SINGLE_ONLY） | **唯一方案**：单 ustreamer 实例；切档时重启进程改分辨率；前端短暂黑屏可接受 |
| WSL2 mock | 不启动相机进程 |
| 跨进程重复拉起 ctl | flock 锁文件拒绝第二实例 |

## 5. 测试计划

1. 树莓派安装 `ustreamer`，确认设备可读。
2. 运行 `camera_probe_dual.sh`，以 `source.online` 为准得到 `SINGLE_ONLY`（勿仅凭进程存活判 `DUAL_OK`）。
3. 启动 `camera_ustreamer_ctl`，用 `curl` 验证 `:8080/stream` 与 `:8082/quality`。
4. 修改 bringup 后，实机 `use_mock_hardware:=false` 验证默认拉起。
5. 上位机：默认低延迟出图、切换高清、断线提示与重连。
6. 冒烟：rosbridge `9090` 控制与遥测不受影响。
7. `use_camera:=false` 时无推流进程。

## 6. 被否决的方案

| 方案 | 否决原因 |
| --- | --- |
| 双实例双端口（8080 + 8081） | 探测误报 `DUAL_OK`；第二路 `online=false`，UVC 不能真双开 |
| WebRTC（go2rtc / MediaMTX） | 信令复杂，联调成本高，同局域网收益有限 |
| ROS `v4l2_camera` + `web_video_server` | 多一跳延迟，且本次不需要 ROS 图像话题 |
| 经 rosbridge 传压缩图 | Base64 / JSON 开销大，延迟与带宽不可接受 |

## 7. 实现边界清单

- [x] `smartcar.launch.py` / `camera.launch.py`：参数 + `ExecuteProcess`（含 mock / 开关条件）
- [x] `camera_ustreamer_ctl.py`：单实例生命周期 + `/quality` + flock
- [x] `MapCameraView.jsx`：真实拉流 + 档位切换 + 重连
- [x] 必要时同步 `topside/dist` 构建产物（若仓库托管静态产物）
- [x] README / topside README / 验证手册
- [ ] 树莓派：安装依赖 → pull 代码 → 实机联调至通过（部署侧持续验收）
