# scripts —— 编译与开发环境脚本

本目录存放工程的编译、环境配置脚本。本仓库根即 colcon 工作空间根，ROS 包位于
`src/` 下，目录结构为 `<仓库根>/scripts/`。

## 脚本清单

| 脚本 | 作用 |
|---|---|
| `build.sh` | 一键编译整个工作空间，并开启 `compile_commands.json` 导出 |
| `setup_clangd.sh` | 合并各包的编译数据库到仓库根，供 clangd 索引 |
| `install_hik_camera_system.sh` | 在显式开关下安装单目相机的 udev、USB 缓冲和可选 RT 服务 |
| `show_system_info.py` | 在 0.96寸 I2C OLED (SSD1306) 显示屏上实时显示系统 CPU、温度、内存和硬盘使用率 |

## build.sh

一键编译，等价于在仓库根执行
`colcon build --symlink-install --cmake-args -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`。

```bash
cd <仓库根>/scripts
./build.sh

# 可透传 colcon 参数，例如只编译指定包
./build.sh --packages-select motor_driver
```

脚本自动定位仓库根、`source /opt/ros/jazzy/setup.bash`，并在缺少 ROS 环境
时报错退出。

## setup_clangd.sh

生成 clangd 所需的合并编译数据库。

```bash
cd <仓库根>/scripts
./setup_clangd.sh
```

工作流程：

1. 若尚未编译，自动调用 `build.sh`。
2. 收集 `<仓库根>/build/*/compile_commands.json`。
3. 合并去重后写入 `<仓库根>/compile_commands.json`。

该文件与仓库根的 [`.clangd`](../.clangd) 同目录，clangd 会从源文件向上查找并
自动加载，从而对 `src/motor_driver`、`src/smartcar_bringup` 等所有包提供补全、
跳转与诊断。

## 关于 clangd

本项目统一使用 **clangd** 作为 C++ 语言服务器，不使用 Microsoft C/C++ 扩展的
IntelliSense。VS Code 用户需：

1. 安装 `clangd` 扩展（`llvm-vs-code-extensions.vscode-clangd`）。
2. 在 C/C++ 扩展设置中关闭 IntelliSense（`C_Cpp.intelliSenseEngine` 设为
   `disabled`），避免与 clangd 冲突。
3. 运行 `./setup_clangd.sh` 生成编译数据库。

`.clangd` 已强制 C++20 并移除 GCC 专有参数，确保 clangd（clang 前端）能正确解析
`<numbers>` 等 C++20 特性。

## install_hik_camera_system.sh

该脚本默认只显示帮助，不会改动系统。首次部署海康 USB 单目相机时，可显式安装稳定别名和 USB 缓冲配置：

```bash
bash scripts/install_hik_camera_system.sh --install-udev --configure-usb-buffer \
  --workspace /home/bean/smart_car_robot
sudo reboot
```

重启后，`/dev/hik_monocular` 应指向具备 `capture` 能力、且已绑定序列号的相机。
使用 `udevadm info --query=property --name=/dev/hik_monocular | grep
'^ID_V4L_CAPABILITIES=.*capture'` 验证。`--install-rt-service` 只安装 FIFO
`systemd` 单元，不会自动启用；必须先完成 `/hik_monocular/image_raw/compressed`
的 `60 s` 基准测试，并确认平均频率不低于 `28 fps` 后再人工启用。相机为单实例
设备；若启动失败，先用 `fuser -v /dev/hik_monocular /dev/video0` 找出并正常停止
已有启动入口，不能同时启动独立相机和整车相机。

## show_system_info.py

在 0.96寸 I2C OLED (SSD1306) 显示屏上实时显示当前系统的 CPU 使用率、CPU 温度、内存使用率和硬盘使用率。

### 依赖安装 (树莓派)

```bash
pip install psutil Pillow luma.oled
# 或者使用 adafruit 驱动:
# pip install psutil Pillow adafruit-circuitpython-ssd1306
```

### 运行方式

```bash
# 树莓派实机运行 (默认 I2C Bus=1, Address=0x3C)
python3 scripts/show_system_info.py

# 指定刷新间隔 (如 2 秒)
python3 scripts/show_system_info.py --interval 2.0

# 终端控制台调试模式 (用于无 OLED 屏幕测试)
python3 scripts/show_system_info.py --console
```
