"""海康 USB 单目相机资源包的配置契约测试。

Author: ChangBin bin_chang@qq.com
Date: 2026-08-10
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-08-10
Copyright (c) 2026 by ChangBin, All Rights Reserved.
Description: 锁定已实测的 MJPEG 1080P@30fps 相机参数，并阻止未标定的
    CameraInfo 被伪装成可用于感知的内参。
"""

from pathlib import Path

import yaml


# 仓库根目录：test/ -> hik_camera_bringup/ -> src/ -> repo root。
ROOT = Path(__file__).parents[3]
# usb_cam 节点参数文件。
CONFIG = ROOT / "src/hik_camera_bringup/config/hik_monocular.yaml"
# MJPEG 解码桥接节点参数文件。
DECODER_CONFIG = ROOT / "src/hik_camera_bringup/config/hik_mjpeg_decoder.yaml"
# 初始 CameraInfo 标定占位文件。
CALIBRATION = (
    ROOT / "src/hik_camera_bringup/camera_info/"
    "hik_monocular_calibration.yaml"
)
# 相机启动文件，负责命名空间、CPU 亲和性和可选 Web 预览。
LAUNCH = ROOT / "src/hik_camera_bringup/launch/hik_camera.launch.py"
# 设备别名规则，只应匹配已测量的唯一相机。
UDEV_RULE = ROOT / "src/hik_camera_bringup/config/99-hik-monocular.rules"
# 系统级配置安装脚本，默认不得写入系统目录。
SYSTEM_INSTALLER = ROOT / "scripts/install_hik_camera_system.sh"


def test_hik_camera_yaml_locks_mjpeg_1080p_30fps() -> None:
    """配置只能使用实测可达的 MJPEG 1080P@30fps 采集契约。"""
    parameters = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))["/**"][
        "ros__parameters"
    ]

    assert parameters["video_device"] == "/dev/hik_monocular"
    assert parameters["pixel_format"] == "raw_mjpeg"
    assert parameters["io_method"] == "mmap"
    assert parameters["image_width"] == 1920
    assert parameters["image_height"] == 1080
    assert parameters["framerate"] == 30.0
    assert parameters["frame_id"] == "hik_monocular_optical_frame"
    assert parameters["camera_name"] == "hik_monocular"
    assert parameters["camera_info_url"] == (
        "package://hik_camera_bringup/camera_info/"
        "hik_monocular_calibration.yaml"
    )


def test_decoder_yaml_locks_output_dimensions() -> None:
    """解码桥接必须仅接受与采集契约一致的图像尺寸。"""
    parameters = yaml.safe_load(DECODER_CONFIG.read_text(encoding="utf-8"))["/**"][
        "ros__parameters"
    ]

    assert parameters["expected_image_width"] == 1920
    assert parameters["expected_image_height"] == 1080


def test_initial_calibration_is_explicitly_invalid() -> None:
    """占位标定文件必须保持零内参，避免被误用为真实几何参数。"""
    calibration = yaml.safe_load(CALIBRATION.read_text(encoding="utf-8"))

    assert calibration["image_width"] == 0
    assert calibration["image_height"] == 0
    assert calibration["camera_matrix"]["data"] == [0.0] * 9


def test_initial_calibration_warns_about_perception_use() -> None:
    """标定占位文件必须写明禁止用于感知，避免静默误用。"""
    calibration_text = CALIBRATION.read_text(encoding="utf-8")

    assert "禁止用于感知" in calibration_text


def test_launch_is_namespaced_and_preview_is_opt_in() -> None:
    """相机 Launch 必须进程内组合，并隔离外部接口和可选预览。"""
    launch_text = LAUNCH.read_text(encoding="utf-8")

    assert "ComposableNodeContainer" in launch_text
    assert 'plugin="usb_cam::UsbCamNode"' in launch_text
    assert 'plugin="hik_camera_bringup::HikMjpegDecoderNode"' in launch_text
    assert '"use_intra_process_comms": True' in launch_text
    assert 'namespace="driver"' in launch_text
    assert 'namespace="/hik_monocular"' in launch_text
    assert (
        '"use_web_preview",\n'
        '            default_value="false"'
    ) in launch_text
    assert 'package="web_video_server"' in launch_text
    assert "IfCondition(use_web_preview)" in launch_text
    assert "taskset" in launch_text


def test_udev_rule_matches_only_measured_camera() -> None:
    """别名规则必须绑定唯一相机的 V4L2 采集节点。"""
    rule = UDEV_RULE.read_text(encoding="utf-8")

    assert 'ATTRS{idVendor}=="2bdf"' in rule
    assert 'ATTRS{idProduct}=="0293"' in rule
    assert 'ATTRS{serial}=="DC474C00_P090100_SN0002"' in rule
    assert 'ENV{ID_V4L_CAPABILITIES}=="*:capture:*"' in rule
    assert 'SYMLINK+="hik_monocular"' in rule


def test_system_installer_is_opt_in() -> None:
    """无参数的系统安装脚本不得写入系统目录。"""
    script = SYSTEM_INSTALLER.read_text(encoding="utf-8")

    assert "INSTALL_UDEV=false" in script
    assert "CONFIGURE_USB_BUFFER=false" in script
    assert "INSTALL_RT_SERVICE=false" in script
