"""
Author: ChangBin bin_chang@qq.com
Date: 2026-07-23
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-07-23
Copyright (c) 2026 by ChangBin, All Rights Reserved.
Description: Xbox 手柄遥控独立启动脚本 (joy_node + joystick_teleop_node)
"""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, OpaqueFunction
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def setup_launch_nodes(context, *args, **kwargs):
    """根据 launch 上下文中的参数动态配置并生成节点列表。

    Args:
        context: LaunchContext 实例，包含运行时参数映射。
        *args: 可变位置参数。
        **kwargs: 可变关键字参数。

    Returns:
        Node 列表，包含配置好的 joy_node 与 joystick_teleop_node。
    """
    pkg_share = FindPackageShare("smartcar_bringup")
    default_config_path = PathJoinSubstitution(
        [pkg_share, "config", "xbox_teleop.yaml"]
    )

    joy_config = LaunchConfiguration("joy_config")
    joy_dev_str = LaunchConfiguration("joy_dev").perform(context)

    # 智能解析 joy_dev 参数：
    # 1. 若为 /dev/input/jsX 格式，提取 X 作为整型 device_id 传给 joy_node
    # 2. 若为纯数字，直接转为整型 device_id 传入
    # 3. 若为手柄名称字符串，作为 device_name 传入
    if "js" in joy_dev_str:
        try:
            device_id = int(joy_dev_str.split("js")[-1])
            joy_params = [joy_config, {"device_id": device_id, "device_name": ""}]
        except ValueError:
            joy_params = [joy_config, {"device_name": joy_dev_str}]
    elif joy_dev_str.isdigit():
        joy_params = [joy_config, {"device_id": int(joy_dev_str), "device_name": ""}]
    else:
        joy_params = [joy_config, {"device_name": joy_dev_str}]

    # 手柄硬件接入节点
    joy_node = Node(
        package="joy",
        executable="joy_node",
        name="joy_node",
        output="screen",
        parameters=joy_params,
    )

    # 手柄输入到速度指令的统一转换节点。
    joystick_teleop_node = Node(
        package="smartcar_bringup",
        executable="joystick_teleop.py",
        name="joystick_teleop_node",
        output="screen",
        parameters=[joy_config],
    )

    return [joy_node, joystick_teleop_node]


def generate_launch_description():
    """生成手柄遥控控制栈的 launch 描述。

    包含两个主要节点：
      1. joy_node: 读取 Linux 游戏手柄设备 (/dev/input/js0)，发布 /joy 话题
      2. joystick_teleop_node: 解析 /joy，并转为
         /mecanum_drive_controller/reference (TwistStamped)

    Returns:
        包含参数声明与节点加载动作的 LaunchDescription 实例。
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

    return LaunchDescription(
        declared_arguments + [OpaqueFunction(function=setup_launch_nodes)]
    )
