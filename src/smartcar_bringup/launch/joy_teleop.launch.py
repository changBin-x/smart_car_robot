"""
Author: ChangBin bin_chang@qq.com
Date: 2026-07-23
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-07-23
Copyright (c) 2026 by ChangBin, All Rights Reserved.
Description: Xbox 手柄遥控独立启动脚本 (joy_node + teleop_twist_joy_node)
"""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    """生成手柄遥控控制栈的 launch 描述。

    包含两个主要节点：
      1. joy_node: 读取 Linux 游戏手柄设备 (/dev/input/js0)，发布 /joy 话题
      2. teleop_twist_joy_node: 解析 /joy 并转为 /mecanum_drive_controller/reference (TwistStamped)
    """
    pkg_share = FindPackageShare("smartcar_bringup")
    default_config_path = PathJoinSubstitution(
        [pkg_share, "config", "xbox_teleop.yaml"]
    )

    declared_arguments = [
        DeclareLaunchArgument(
            "joy_config",
            default_value=default_config_path,
            description="Xbox 手柄参数配置文件路径",
        ),
        DeclareLaunchArgument(
            "joy_dev",
            default_value="/dev/input/js0",
            description="手柄 Linux 设备节点路径",
        ),
    ]

    joy_config = LaunchConfiguration("joy_config")
    joy_dev = LaunchConfiguration("joy_dev")

    # 手柄硬件接入节点
    joy_node = Node(
        package="joy",
        executable="joy_node",
        name="joy_node",
        output="screen",
        parameters=[
            joy_config,
            {"device_name": joy_dev},
        ],
    )

    # 手柄按键到速度指令转换节点
    teleop_twist_joy_node = Node(
        package="teleop_twist_joy",
        executable="teleop_twist_joy_node",
        name="teleop_twist_joy_node",
        output="screen",
        parameters=[joy_config],
        remappings=[
            ("cmd_vel", "/mecanum_drive_controller/reference"),
        ],
    )

    return LaunchDescription(
        declared_arguments
        + [
            joy_node,
            teleop_twist_joy_node,
        ]
    )
