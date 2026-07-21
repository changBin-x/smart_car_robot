#!/usr/bin/env python3
# Copyright (c) 2026 by ChangBin, All Rights Reserved.
"""RViz 显示 launch：发布机器人模型并可选打开 RViz。

用 OpaqueFunction 展开 xacro；默认用无 GUI 的 joint_state_publisher
（参数注入可靠）。可选 use_jsp_gui:=true。

重要：默认 ROS_AUTOMATIC_DISCOVERY_RANGE=LOCALHOST，避免与同网段
smartcar_bringup 同名 TF（base_link / *_wheel_link）混用，导致
RobotModel 网格按错误 TF 摆放、出现车身与轮分离。
"""

import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, OpaqueFunction, SetEnvironmentVariable
from launch.conditions import IfCondition, UnlessCondition
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def _launch_setup(context, *args, **kwargs):
    """展开 URDF 并创建节点列表。"""
    share = get_package_share_directory("smartcar_description")
    xacro_path = os.path.join(share, "urdf", "smartcar.urdf.xacro")
    rviz_cfg = os.path.join(share, "rviz", "smartcar.rviz")

    from xacro import process_file

    urdf_xml = process_file(xacro_path).toxml()
    params = {"robot_description": urdf_xml}

    use_rviz = LaunchConfiguration("use_rviz")
    use_jsp_gui = LaunchConfiguration("use_jsp_gui")

    return [
        Node(
            package="robot_state_publisher",
            executable="robot_state_publisher",
            name="robot_state_publisher",
            output="screen",
            parameters=[params],
        ),
        Node(
            package="joint_state_publisher",
            executable="joint_state_publisher",
            name="joint_state_publisher",
            output="screen",
            parameters=[params],
            condition=UnlessCondition(use_jsp_gui),
        ),
        Node(
            package="joint_state_publisher_gui",
            executable="joint_state_publisher_gui",
            name="joint_state_publisher_gui",
            output="screen",
            parameters=[params],
            condition=IfCondition(use_jsp_gui),
        ),
        Node(
            package="rviz2",
            executable="rviz2",
            name="rviz2",
            arguments=["-d", rviz_cfg],
            condition=IfCondition(use_rviz),
        ),
    ]


def generate_launch_description() -> LaunchDescription:
    """构建 display launch 描述。"""
    return LaunchDescription(
        [
            SetEnvironmentVariable(
                "ROS_AUTOMATIC_DISCOVERY_RANGE", "LOCALHOST"
            ),
            DeclareLaunchArgument(
                "use_rviz",
                default_value="true",
                description="Whether to start rviz2 with smartcar.rviz.",
            ),
            DeclareLaunchArgument(
                "use_jsp_gui",
                default_value="false",
                description="Use joint_state_publisher_gui instead of headless JSP.",
            ),
            OpaqueFunction(function=_launch_setup),
        ]
    )
