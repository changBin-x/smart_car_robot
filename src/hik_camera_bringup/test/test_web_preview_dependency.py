"""测试 Web 预览依赖预检逻辑。

Author: ChangBin bin_chang@qq.com
Date: 2026-08-14
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-08-14
Copyright (c) 2026 by ChangBin, All Rights Reserved.
Description: 验证启用 Web 预览时，启动文件能在创建相机组件前发现
    web_video_server 缺失，并给出可直接执行的 ROS Jazzy 安装命令。
"""

import importlib.util
from pathlib import Path
from unittest.mock import patch

import pytest
from ament_index_python.packages import PackageNotFoundError


ROOT = Path(__file__).parents[3]
LAUNCH = ROOT / "src/hik_camera_bringup/launch/hik_camera.launch.py"
MODULE_SPEC = importlib.util.spec_from_file_location("hik_camera_launch", LAUNCH)
assert MODULE_SPEC is not None
assert MODULE_SPEC.loader is not None
HIK_CAMERA_LAUNCH = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(HIK_CAMERA_LAUNCH)


def test_disabled_preview_does_not_require_web_video_server() -> None:
    """关闭 Web 预览时不应查询额外依赖。"""
    with patch.object(
        HIK_CAMERA_LAUNCH,
        "get_package_prefix",
        side_effect=AssertionError("不应查询 Web 预览依赖"),
    ):
        HIK_CAMERA_LAUNCH._validate_web_preview_dependency(False)


def test_missing_package_raises_actionable_error() -> None:
    """缺少 ROS 包时应给出明确的 apt 安装命令。"""
    with patch.object(
        HIK_CAMERA_LAUNCH,
        "get_package_prefix",
        side_effect=PackageNotFoundError("web_video_server"),
    ):
        with pytest.raises(RuntimeError, match="ros-jazzy-web-video-server"):
            HIK_CAMERA_LAUNCH._validate_web_preview_dependency(True)


def test_missing_executable_raises_actionable_error(tmp_path: Path) -> None:
    """ROS 包索引存在但可执行文件缺失时也必须拒绝启动。"""
    with patch.object(
        HIK_CAMERA_LAUNCH,
        "get_package_prefix",
        return_value=str(tmp_path),
    ):
        with pytest.raises(RuntimeError, match="web_video_server"):
            HIK_CAMERA_LAUNCH._validate_web_preview_dependency(True)


def test_existing_executable_passes(tmp_path: Path) -> None:
    """ROS 包和 Web 服务可执行文件均存在时预检应通过。"""
    executable = tmp_path / "lib" / "web_video_server" / "web_video_server"
    executable.parent.mkdir(parents=True)
    executable.write_text("#!/bin/sh\n", encoding="utf-8")
    executable.chmod(0o755)

    with patch.object(
        HIK_CAMERA_LAUNCH,
        "get_package_prefix",
        return_value=str(tmp_path),
    ):
        HIK_CAMERA_LAUNCH._validate_web_preview_dependency(True)
