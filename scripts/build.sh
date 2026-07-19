#!/usr/bin/env bash
# Author: ChangBin bin_chang@qq.com
# Date: 2026-07-17
# LastEditors: ChangBin bin_chang@qq.com
# LastEditTime: 2026-07-17
# Copyright (c) 2026 by ChangBin, All Rights Reserved.
# Description: 一键编译四轮麦克纳姆小车工程
#
# 用法：
#   cd <仓库根>/scripts && ./build.sh [colcon 额外参数...]
#
# 行为：
#   1. 定位工作空间根（本仓库根即 colcon 工作空间根，脚本位于 <仓库根>/scripts/）
#   2. source ROS 2 Jazzy 环境
#   3. colcon build --symlink-install，并开启 compile_commands.json 导出
#      （供 clangd 索引，见 setup_clangd.sh）
#
# 设计说明：
#   - 使用 -DCMAKE_EXPORT_COMPILE_COMMANDS=ON 让每个包生成
#     build/<pkg>/compile_commands.json。
#   - 严格模式 set -euo pipefail，任一步失败立即退出并报错。

set -euo pipefail

# ---- 定位路径 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # <仓库根>/scripts
WS_DIR="$(dirname "$SCRIPT_DIR")"                            # <仓库根> = 工作空间根

ROS_SETUP="/opt/ros/jazzy/setup.bash"
if [[ ! -f "$ROS_SETUP" ]]; then
  echo "[build] 错误：找不到 $ROS_SETUP，请先安装 ROS 2 Jazzy" >&2
  exit 1
fi

echo "[build] 工作空间：$WS_DIR"
# ROS 的 setup.bash 会引用未定义变量，source 期间临时关闭 nounset
set +u
# shellcheck disable=SC1090
source "$ROS_SETUP"
set -u

# ---- 编译 ----
cd "$WS_DIR"
colcon build \
  --symlink-install \
  --cmake-args -DCMAKE_EXPORT_COMPILE_COMMANDS=ON \
  "$@"

echo "[build] 编译完成。后续可执行：source $WS_DIR/install/setup.zsh"
