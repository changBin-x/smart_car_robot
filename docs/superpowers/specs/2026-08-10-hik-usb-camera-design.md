# 海康 USB 单目相机 ROS 2 采集与 Web 预览设计规格

**状态：** 已确认，待实施

**日期：** 2026-08-10

**目标平台：** 树莓派 4B、Ubuntu 24.04、ROS 2 Jazzy、Linux PREEMPT_RT

## 1. 目标与边界

本功能以 `usb_cam` 作为 `/dev/hik_monocular` 的唯一 V4L2 采集者，向
ROS 2 发布可供后续 perception 模块使用的 1920×1080、30 fps、`rgb8`
单目图像和标准 `CameraInfo`。采集格式必须是 MJPEG，不能使用 1080P
下仅能达到 5 fps 的 YUYV 或 NV12 裸流。

本次同时提供可选的 `web_video_server` HTTP/MJPEG 预览。预览是低优先级
功能：一旦其降低感知图像帧率、增加持续丢帧或超出 CPU 预算，立即关闭
`use_web_preview`，不影响相机采集和后续感知。

本次不实现视觉检测、深度估计、SLAM、避障或相机到车体的外参标定。没有
实测外参时，不得发布伪造的 `base_link` 到相机光学坐标系 TF。

## 2. 已验证事实

树莓派 `v4l2-ctl --device=/dev/video0 --list-formats-ext` 实测结果：

| 格式 | 1920×1080 最大帧率 | 结论 |
|---|---:|---|
| YUYV | 5 fps | 禁止用于本功能 |
| NV12 | 5 fps | 禁止用于本功能 |
| MJPG | 30 fps（0.033 s） | 唯一允许的采集格式 |

相机 USB 标识为 VID `2bdf`、PID `0293`、序列号
`DC474C00_P090100_SN0002`。树莓派已安装
`ros-jazzy-usb-cam` 0.8.1 和 `image_transport` 压缩插件；
`ros-jazzy-web-video-server` 可从当前软件源安装。

`usb_cam` 的 Jazzy 参数模板使用 `pixel_format: mjpeg2rgb`，而不是
`mjpeg` 或 `out_format`。因此本项目统一以 `rgb8` 作为原始图像编码；
如 OpenCV 算法需要 BGR，仅在该算法节点内部转换。

## 3. 架构

```text
/dev/hik_monocular
  -> usb_cam（唯一 V4L2 打开者；MJPEG -> rgb8）
     -> /hik_monocular/image_raw
     -> /hik_monocular/camera_info
     -> /hik_monocular/image_raw/compressed
        -> web_video_server（仅 use_web_preview:=true）
           -> http://<pi-ip>:8080/stream?topic=/hik_monocular/image_raw
```

`usb_cam` 是唯一允许打开相机设备的进程。现有 `ustreamer`、
`camera_ustreamer_ctl.py`、8082 质量切换接口和对应前端逻辑必须删除，
避免两个进程争用同一 UVC 设备。

新建资源包装包 `src/hik_camera_bringup`。它不包含自定义图像采集 C++ 逻辑，
只安装配置、Launch、标定文件、系统规则模板和文档。包内文件职责如下：

| 路径 | 职责 |
|---|---|
| `config/hik_monocular.yaml` | `usb_cam` 的硬件、格式、分辨率、帧率和 CameraInfo 参数 |
| `camera_info/hik_monocular_calibration.yaml` | 标准相机标定文件；未标定时仅作显式占位，不能供 perception 使用 |
| `launch/hik_camera.launch.py` | 启动 `usb_cam`、可选 CPU 亲和性和可选 Web 视频服务 |
| `config/99-hik-monocular.rules` | `/dev/hik_monocular` 的 udev 规则模板 |
| `config/hik-camera.service` | 可选 FIFO 实时调度的 systemd 单元模板 |
| `doc/验证手册.md` | 安装、绑定、标定、性能测量和回滚步骤 |

## 4. ROS 2 接口契约

`usb_cam` 节点运行在 `/hik_monocular` 命名空间，节点名为
`usb_cam`。通过命名空间得到话题，不依赖全局话题重映射：

| 接口 | 类型 | 约束 |
|---|---|---|
| `/hik_monocular/image_raw` | `sensor_msgs/msg/Image` | 1920×1080、`rgb8`、目标 30 fps |
| `/hik_monocular/camera_info` | `sensor_msgs/msg/CameraInfo` | 与图像时间戳、尺寸、帧 ID 一致 |
| `/hik_monocular/image_raw/compressed` | `sensor_msgs/msg/CompressedImage` | `image_transport` 插件按需生成，不作为感知主输入 |
| `hik_monocular_optical_frame` | TF 帧名 | 图像与 CameraInfo 的 `frame_id`；本次无父 TF |

`config/hik_monocular.yaml` 的固定参数为：

```yaml
video_device: /dev/hik_monocular
pixel_format: mjpeg2rgb
io_method: mmap
image_width: 1920
image_height: 1080
framerate: 30.0
frame_id: hik_monocular_optical_frame
camera_name: hik_monocular
camera_info_url: package://hik_camera_bringup/camera_info/hik_monocular_calibration.yaml
```

`smartcar.launch.py` 默认不启动相机，新增 `use_hik_camera:=false` 与
`use_web_preview:=false`。用户可以独立启动 `hik_camera.launch.py`，或在
总启动中显式设置 `use_hik_camera:=true`。相机无法打开、标定无效或 Web
预览失败不得阻断底盘、IMU、EKF、遥控和 rosbridge。

## 5. Web 预览

`web_video_server` 是唯一的 Web 桥接方案，不通过 rosbridge 传输图像。它
监听 `0.0.0.0:8080`，使用 MJPEG 流，并由前端以如下形式请求：

```text
http://<pi-ip>:8080/stream?topic=/hik_monocular/image_raw&width=640&height=360&quality=70
```

前端删除低延迟/高清双档与 8082 控制请求，只保留单一预览和断流重连。Web
预览默认关闭。仅在相机主链路通过 60 秒基准测试后启用；启用后若主图像不再
满足验收阈值，关闭 `use_web_preview` 并保留 ROS 感知图像。

## 6. 系统配置

### 6.1 设备稳定绑定

udev 规则同时匹配 VID、PID 和序列号，创建 `/dev/hik_monocular`。匹配不到
时必须失败并报告设备不存在，不能静默回退到任意 `/dev/video*`。

### 6.2 USB 缓冲区

安装脚本只在参数缺失时向实际存在的
`/boot/firmware/cmdline.txt` 或 `/boot/cmdline.txt` 追加
`usbcore.usbfs_memory_mb=128`。该参数位于单行 cmdline 中，修改后需要重启，
并用 `/proc/cmdline` 验证。脚本必须先备份目标文件，不能重复追加参数。

### 6.3 CPU 与实时调度

采集节点默认使用 `taskset -c 2` 绑定 CPU 2，仍使用系统普通调度策略。
当前树莓派实时优先级限制为 0，故 `SCHED_FIFO` 不得由 Launch 默认启用。

通过性能基线后，可选安装 systemd 单元，显式设置：

```ini
CPUAffinity=2
CPUSchedulingPolicy=fifo
CPUSchedulingPriority=70
LimitRTPRIO=70
```

该单元与普通 Launch 二选一，避免同一设备重复启动。启用前必须确认 RT
权限、生效的 CPU 亲和性和失控进程的停止方法。

## 7. 标定与 TF 门禁

仓库提供 A4 横向可打印棋盘格：9×7 方格、8×6 内角点、每格 25 mm。打印时
必须禁用缩放，并用直尺核验任一方格边长为 25 mm。

未标定的 YAML 必须清晰标记为占位，且验证手册明确禁止其用于几何测量、
定位、建图或避障。标定命令固定为：

```bash
ros2 run camera_calibration cameracalibrator \
  --size 8x6 --square 0.025 \
  image:=/hik_monocular/image_raw camera:=/hik_monocular
```

标定通过后，将输出的标准 `CameraInfo` YAML 归档为
`camera_info/hik_monocular_calibration.yaml`，检查 `image_width`、
`image_height`、`camera_matrix`、`distortion_model` 和畸变参数均为有效值，
再以重投影误差和实拍直线畸变检查决定是否接受。

相机到 `base_link` 的机械位置和姿态未知，本次只使用
`hik_monocular_optical_frame`，不发布任何外参 TF。安装完成且测量外参后，
后续变更才可新增 `base_link -> hik_monocular_optical_frame` 静态变换。

## 8. 验收、回滚与性能门禁

实施完成必须按顺序验证：

1. `v4l2-ctl` 显示 MJPG 1920×1080@30 fps，且配置没有 YUYV/NV12 回退。
2. `ros2 topic echo --once /hik_monocular/camera_info` 返回与 1920×1080
   一致的 CameraInfo；未标定状态必须可辨识。
3. 连续 60 秒执行 `ros2 topic hz /hik_monocular/image_raw`，平均帧率不低于
   28 fps，并记录 CPU 使用率、丢帧和端到端延迟。
4. 启用 Web 预览后，重复第 3 步；若主图像低于 28 fps、出现持续丢帧或 CPU
   预算超标，关闭 `use_web_preview`。
5. `use_hik_camera:=false` 时没有 `usb_cam` 或 `web_video_server` 进程，底盘
   启动仍成功。
6. 确认 udev 规则后重新插拔相机，`/dev/hik_monocular` 始终指向同一序列号。

回滚路径是禁用 `use_hik_camera` 和 `use_web_preview`，停止 systemd 单元（若
已启用），并恢复上一提交；绝不重新启用 `ustreamer` 与 `usb_cam` 的并发采集。

## 9. 实施迁移范围

- 新增 `hik_camera_bringup` 资源包、配置契约测试、系统部署脚本和标定资产。
- 修改 `smartcar_bringup` 总 Launch，使相机为显式可选项。
- 删除 `ustreamer` 控制脚本、旧相机 Launch、相关 CMake 安装规则、参数、
  文档和测试。
- 修改 `topside` 前端摄像机组件及单元测试，改用 `web_video_server` 话题查询
  URL，不再访问 8082。
- 更新根 README、`smartcar_bringup` README、ROS 接口文档、验证手册和系统
  安装说明。

## 10. 依据

- 树莓派实测 V4L2 能力（2026-08-10）。
- [usb_cam 官方仓库](https://github.com/ros-drivers/usb_cam)：V4L2、`mmap`、
  `pixel_format` 和 `image_transport` 支持。
- [web_video_server 官方仓库](https://github.com/RobotWebTools/web_video_server)：
  Jazzy 软件包、`/stream?topic=...`、缩放和 JPEG 质量参数。
- [image_transport 官方教程](https://github.com/ros-perception/image_transport_tutorials)：
  压缩传输插件按需发现与使用。
