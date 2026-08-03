"""
Author: ChangBin bin_chang@qq.com
Date: 2026-08-03
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-08-03
Copyright (c) 2026 by ChangBin, All Rights Reserved.
Description: 启动单实例 ustreamer 摄像头 MJPEG 推流质量控制器。
"""

import os

from ament_index_python.packages import get_package_prefix
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, ExecuteProcess
from launch.substitutions import LaunchConfiguration


RASPBERRY_PI_PYTHON = "/home/bean/Documents/ros2_venv/bin/python3"


def generate_launch_description():
    """生成摄像头推流控制器 launch 描述。"""
    declared_arguments = [
        DeclareLaunchArgument(
            "camera_device",
            default_value="/dev/video0",
            description="UVC 摄像头设备路径",
        ),
        DeclareLaunchArgument(
            "camera_stream_port",
            default_value="8080",
            description="ustreamer MJPEG HTTP 推流端口",
        ),
        DeclareLaunchArgument(
            "camera_ctl_port",
            default_value="8082",
            description="摄像头质量切换 HTTP 控制端口",
        ),
    ]

    camera_device = LaunchConfiguration("camera_device")
    camera_stream_port = LaunchConfiguration("camera_stream_port")
    camera_ctl_port = LaunchConfiguration("camera_ctl_port")
    python_executable = (
        RASPBERRY_PI_PYTHON if os.path.exists(RASPBERRY_PI_PYTHON) else "python3"
    )
    ctl = os.path.join(
        get_package_prefix("smartcar_bringup"),
        "lib",
        "smartcar_bringup",
        "camera_ustreamer_ctl.py",
    )

    camera_ustreamer_ctl = ExecuteProcess(
        cmd=[
            python_executable,
            ctl,
            "--device",
            camera_device,
            "--stream-port",
            camera_stream_port,
            "--ctl-port",
            camera_ctl_port,
            "--host",
            "0.0.0.0",
        ],
        output="screen",
        emulate_tty=True,
    )

    return LaunchDescription(declared_arguments + [camera_ustreamer_ctl])
