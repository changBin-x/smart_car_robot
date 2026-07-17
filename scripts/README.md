# scripts —— 编译与开发环境脚本

本目录存放工程的编译、环境配置脚本。所有脚本假定本仓库位于 colcon 工作空间的
`src/` 下，即目录结构为 `<工作空间>/src/scripts/`。

## 脚本清单

| 脚本 | 作用 |
|---|---|
| `build.sh` | 一键编译整个工作空间，并开启 `compile_commands.json` 导出 |
| `setup_clangd.sh` | 合并各包的编译数据库到仓库根，供 clangd 索引 |

## build.sh

一键编译，等价于在工作空间根执行
`colcon build --symlink-install --cmake-args -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`。

```bash
cd <工作空间>/src/scripts
./build.sh

# 可透传 colcon 参数，例如只编译指定包
./build.sh --packages-select motor_driver
```

脚本自动定位工作空间根、`source /opt/ros/jazzy/setup.bash`，并在缺少 ROS 环境
时报错退出。

## setup_clangd.sh

生成 clangd 所需的合并编译数据库。

```bash
cd <工作空间>/src/scripts
./setup_clangd.sh
```

工作流程：

1. 若工作空间尚未编译，自动调用 `build.sh`。
2. 收集 `<工作空间>/build/*/compile_commands.json`。
3. 合并去重后写入 `<工作空间>/src/compile_commands.json`。

该文件与仓库根的 [`.clangd`](../.clangd) 同目录，clangd 会从源文件向上查找并
自动加载，从而对 `motor_driver`、`smartcar_bringup` 等所有包提供补全、跳转与诊断。

## 关于 clangd

本项目统一使用 **clangd** 作为 C++ 语言服务器，不使用 Microsoft C/C++ 扩展的
IntelliSense。VS Code 用户需：

1. 安装 `clangd` 扩展（`llvm-vs-code-extensions.vscode-clangd`）。
2. 在 C/C++ 扩展设置中关闭 IntelliSense（`C_Cpp.intelliSenseEngine` 设为
   `disabled`），避免与 clangd 冲突。
3. 运行 `./setup_clangd.sh` 生成编译数据库。

`.clangd` 已强制 C++20 并移除 GCC 专有参数，确保 clangd（clang 前端）能正确解析
`<numbers>` 等 C++20 特性。
