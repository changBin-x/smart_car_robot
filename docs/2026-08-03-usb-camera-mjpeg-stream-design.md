# USB 摄像机低延迟 MJPEG 推流设计规格

| 字段 | 内容 |
| --- | --- |
| 日期 | 2026-08-03 |
| 状态 | 待用户审查 |
| 路径说明 | 仓库已 ignore `docs/superpowers/`，本规格放在 `docs/` 下以便入库 |
| 方案 | ustreamer MJPEG-HTTP（方案一） |
| 目标 | 树莓派 USB 摄像机画面实时显示在 topside React 界面，延迟尽可能低，支持低延迟 / 高清切换 |

## 1. 背景与目标

### 1.1 现状

- 树莓派 4B（`192.168.10.17`）已连接 **1080P USB Camera**，设备节点为 `/dev/video0`。
- 上位机 `MapCameraView` 已有「摄像机」切换入口，但目前仅为占位 UI，文案写明预留 WebRTC / RTSP。
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
┌─────────────────────────────────────┐
│  ustreamer（树莓派，由 bringup 拉起）  │
│  low  :0.0.0.0:8080  640×480 @ 30   │──► /stream
│  high :0.0.0.0:8081  1280×720 @ 15  │──► /stream
└─────────────────────────────────────┘
        │  HTTP MJPEG（旁路，不经 ROS）
        ▼
┌─────────────────────────────────────┐
│  Topside MapCameraView              │
│  <img src="http://<pi-ip>:port/...">│
│  档位切换 = 换 URL（零重启）          │
└─────────────────────────────────────┘

控制 / 遥测仍走 ws://<pi-ip>:9090（rosbridge），与视频解耦。
```

### 2.1 设计原则

1. **媒体旁路**：视频走独立 HTTP 端口，与 rosbridge 解耦，从第一性原理上消除 Base64 / DDS 中转开销。
2. **双档双端口**：低延迟与高清分进程，前端切换只改 URL，避免切档重启带来的黑屏窗口。
3. **实机才启**：仅 `use_mock_hardware:=false` 且 `use_camera:=true` 时启动，避免 WSL2 无设备失败。

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
| `camera_low_port` | `8080` | 低延迟流端口 |
| `camera_high_port` | `8081` | 高清流端口 |

启动条件：`UnlessCondition(use_mock_hardware)` **且** `IfCondition(use_camera)`。

实现方式：`launch.actions.ExecuteProcess` 调用 `ustreamer`（不引入新 ROS 包，保持与现有 bringup 风格一致）。

建议命令形态（以实际 `ustreamer --help` 为准，实现时核对）：

```bash
# 低延迟
ustreamer --device /dev/video0 --host 0.0.0.0 --port 8080 \
  --resolution 640x480 --desired-fps 30 --format MJPEG

# 高清
ustreamer --device /dev/video0 --host 0.0.0.0 --port 8081 \
  --resolution 1280x720 --desired-fps 15 --format MJPEG
```

拉流 URL：

- 低延迟：`http://<pi-ip>:8080/stream`
- 高清：`http://<pi-ip>:8081/stream`

### 3.3 上位机（`MapCameraView.jsx`）

1. 移除「信号未建立」占位为默认态；有流则显示 `<img>`。
2. `streamUrl` 由导航栏已配置的树莓派 IP + 当前档位端口组成。
3. UI 提供「低延迟 / 高清」切换；默认低延迟。
4. `<img onError>`：显示断流提示，并按指数退避重连（例如 1 s → 2 s → 4 s，上限 8 s）。
5. **不经 Node 后端代理**，浏览器直连树莓派，降低一跳延迟。
6. 若浏览器因混合内容限制无法加载（HTTPS 页拉 HTTP 流），文档中说明 topside 以 `http://localhost:3223` 访问；本项目当前为 HTTP 本地服务，无此问题。

### 3.4 文档更新范围

- 根目录 `README.md`：依赖、端口、`use_camera` 参数、验证步骤。
- `topside/README.md`：摄像机话题/流 URL 说明、档位切换。
- `src/smartcar_bringup` 相关 README / 验证手册补充相机验证项（若已有验证手册则追加一节）。

## 4. 错误处理

| 场景 | 行为 |
| --- | --- |
| `/dev/video0` 不存在或无权限 | ustreamer 退出并打日志；控制栈继续；上位机显示断流提示 |
| 网络抖动 / 瞬时断流 | `onError` + 退避重连 |
| 8080 / 8081 端口占用 | 对应进程启动失败，日志明确端口冲突 |
| 双实例无法共享同一 UVC 设备 | **退化方案**：单 ustreamer 实例；切档时重启进程改分辨率；前端短暂黑屏可接受 |
| WSL2 mock | 不启动相机进程 |

退化触发条件：实机验证时若第二个 `ustreamer` 打开设备失败，实现阶段必须切换到单实例方案，并更新本规格对应段落与 README。

## 5. 测试计划

1. 树莓派安装 `ustreamer`，确认设备可读。
2. 手动启动 low / high，用浏览器或 `curl -I http://127.0.0.1:8080/stream` 验证。
3. 验证双开；失败则启用 §4 退化方案。
4. 修改 bringup 后，实机 `use_mock_hardware:=false` 验证默认拉起。
5. 上位机：默认低延迟出图、切换高清、断线提示与重连。
6. 冒烟：rosbridge `9090` 控制与遥测不受影响。
7. `use_camera:=false` 时无推流进程。

## 6. 被否决的方案

| 方案 | 否决原因 |
| --- | --- |
| WebRTC（go2rtc / MediaMTX） | 信令复杂，联调成本高，同局域网收益有限 |
| ROS `v4l2_camera` + `web_video_server` | 多一跳延迟，且本次不需要 ROS 图像话题 |
| 经 rosbridge 传压缩图 | Base64 / JSON 开销大，延迟与带宽不可接受 |

## 7. 实现边界清单

- [ ] `smartcar.launch.py`：参数 + `ExecuteProcess`（含 mock / 开关条件）
- [ ] `MapCameraView.jsx`：真实拉流 + 档位切换 + 重连
- [ ] 必要时同步 `topside/dist` 构建产物（若仓库托管静态产物）
- [ ] README / topside README / 验证手册
- [ ] 树莓派：安装依赖 → pull 代码 → 实机联调至通过
