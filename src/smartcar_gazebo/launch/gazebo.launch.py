#!/usr/bin/env python3
# Copyright (c) 2026 by ChangBin, All Rights Reserved.
"""Gazebo Harmonic 仿真 launch：空世界生成 smartcar 并桥接 /clock。

启动顺序：
1. gz sim（empty.sdf，-r 立即运行）
2. robot_state_publisher（xacro → robot_description）
3. ros_gz_sim create（从 robot_description 生成模型）
4. ros_gz_bridge parameter_bridge（/clock + /joint_states + TF）
5. joint_state_publisher_gui（可选 GUI 控制额外关节）
6. 可选 rviz2（复用 smartcar_description 的 smartcar.rviz）

关键修复：
- 添加 /joint_states bridge 使 Gazebo 关节状态能传递给 RViz
- 添加 /tf bridge 使 Gazebo 仿真 TF 能正确传递
- 使用参数化 bridge 配置便于扩展

不含 ros2_control / 硬件接口；不修改 smartcar_bringup。
"""

import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import (
    DeclareLaunchArgument,
    IncludeLaunchDescription,
    SetEnvironmentVariable,
)
from launch.conditions import IfCondition
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import Command, LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue
from launch_ros.substitutions import FindPackageShare


def _gz_resource_path_with_description() -> str:
    """拼接 GZ_SIM_RESOURCE_PATH，使 model://smartcar_description 可解析。

    Gazebo 会把 URDF 里的 package:// 转成 model://，并在
    GZ_SIM_RESOURCE_PATH 下按 <包名>/... 查找 mesh。

    Returns:
        str: 含 smartcar_description 父目录的资源路径字符串。
    """
    desc_share = get_package_share_directory("smartcar_description")
    # .../share/smartcar_description → .../share
    share_parent = os.path.dirname(desc_share)
    existing = os.environ.get("GZ_SIM_RESOURCE_PATH", "")
    if existing:
        return f"{share_parent}{os.pathsep}{existing}"
    return share_parent


def generate_launch_description() -> LaunchDescription:
    """构建 Gazebo 仿真 launch 描述。

    Returns:
        LaunchDescription: gz sim + RSP + spawn + bridges + 可选 RViz/JSP。
    """
    pkg_gazebo = FindPackageShare("smartcar_gazebo")
    pkg_desc = FindPackageShare("smartcar_description")
    pkg_ros_gz_sim = FindPackageShare("ros_gz_sim")

    world_file = PathJoinSubstitution(
        [pkg_gazebo, "worlds", "empty.sdf"]
    )
    model = PathJoinSubstitution(
        [pkg_desc, "urdf", "smartcar.urdf.xacro"]
    )
    rviz_cfg = PathJoinSubstitution(
        [pkg_desc, "rviz", "smartcar.rviz"]
    )
    gz_sim_launch = PathJoinSubstitution(
        [pkg_ros_gz_sim, "launch", "gz_sim.launch.py"]
    )

    use_rviz = LaunchConfiguration("use_rviz")
    robot_description = ParameterValue(
        Command(["xacro ", model]), value_type=str
    )

    # Bridge 配置：Gazebo ↔ ROS2 话题映射
    # 格式: <ros_topic>@<ros_msg_type>[<gz_msg_type>]
    # 前缀 [ 表示 ROS→GZ，] 后缀表示 GZ→ROS
    bridge_config = [
        # 时钟：Gazebo → ROS（单向）
        "/clock@rosgraph_msgs/msg/Clock[gz.msgs.Clock",
        # 关节状态：Gazebo → ROS（使 RViz 能显示轮子位置）
        "/world/empty/model/smartar/joint_state@sensor_msgs/msg/JointState[gz.msgs.Model",
        # TF：双向同步（Gazebo 仿真 TF 与 ROS TF 树）
        "/tf@tf2_msgs/msg/TF[gz.msgs.TF",
        "/tf_static@tf2_msgs/msg/TFMessage[gz.msgs.TF",
    ]

    # 将 bridge 配置转换为命令行参数列表
    bridge_args = [arg for bridge in bridge_config for arg in ["-b", bridge]]

    return LaunchDescription(
        [
            # 降低与同网段 bringup 同名 TF 冲突（与 description display 一致）
            SetEnvironmentVariable(
                "ROS_AUTOMATIC_DISCOVERY_RANGE", "LOCALHOST"
            ),
            DeclareLaunchArgument(
                "use_rviz",
                default_value="true",
                description="Whether to start rviz2 with smartcar.rviz.",
            ),
            # 让 gz 能解析 model://smartcar_description/meshes/*
            SetEnvironmentVariable(
                "GZ_SIM_RESOURCE_PATH",
                _gz_resource_path_with_description(),
            ),
            # 1) Gazebo Harmonic：加载本包 empty.sdf 并立即运行
            IncludeLaunchDescription(
                PythonLaunchDescriptionSource(gz_sim_launch),
                launch_arguments={
                    "gz_args": ["-r ", world_file],
                    "on_exit_shutdown": "true",
                }.items(),
            ),
            # 2) 发布 TF / robot_description（仿真时钟）
            Node(
                package="robot_state_publisher",
                executable="robot_state_publisher",
                name="robot_state_publisher",
                output="screen",
                parameters=[
                    {"use_sim_time": True},
                    {"robot_description": robot_description},
                ],
            ),
            # 3) 从 robot_description topic 生成实体
            Node(
                package="ros_gz_sim",
                executable="create",
                name="spawn_smartcar",
                output="screen",
                arguments=[
                    "-name",
                    "smartcar",
                    "-topic",
                    "robot_description",
                    "-z",
                    "0.05",
                    "-allow_renaming",
                    "true",
                ],
            ),
            # 4) Gazebo ↔ ROS2 桥接（时钟 + 关节状态 + TF）
            Node(
                package="ros_gz_bridge",
                executable="parameter_bridge",
                name="gz_bridge",
                output="screen",
                arguments=bridge_args,
                parameters=[{
                    # QoS 配置：确保可靠的关节状态传输
                    "qos_overrides./clock.publisher.reliability": "reliable",
                    "qos_overrides./joint_states.publisher.reliability": "reliable",
                    "qos_overrides./tf.publisher.reliability": "reliable",
                    "qos_overrides./tf_static.publisher.reliability": "reliable",
                }],
            ),
            # 5) 可选 RViz（复用 description 配置，使用仿真时钟）
            Node(
                package="rviz2",
                executable="rviz2",
                name="rviz2",
                arguments=["-d", rviz_cfg],
                parameters=[{"use_sim_time": True}],
                condition=IfCondition(use_rviz),
            ),
        ]
    )
