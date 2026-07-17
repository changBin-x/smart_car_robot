# Author: ChangBin bin_chang@qq.com
# Date: 2026-07-17
# LastEditors: ChangBin bin_chang@qq.com
# LastEditTime: 2026-07-17
# Copyright (c) 2026 by ChangBin, All Rights Reserved.
# Description: 一键启动四轮麦克纳姆小车控制栈
# -----------------------------------------------------------
# 启动内容：
#   1) robot_state_publisher —— 用 xacro 展开的 URDF 发布 robot_description + 静态 TF
#   2) controller_manager    —— ros2_control 核心，加载硬件插件
#   3) joint_state_broadcaster（spawner）
#   4) mecanum_drive_controller（spawner，等 broadcaster 起来后再加载）
#
# launch 参数：
#   use_mock_hardware (默认 true)：true=mock 仿真（WSL2），false=实机串口
#   serial_port       (默认 /dev/ttyUSB0)：实机串口设备名
#   baud_rate         (默认 115200)
#
# 用法：
#   WSL2 仿真：ros2 launch smartcar_bringup smartcar.launch.py
#   实机：     ros2 launch smartcar_bringup smartcar.launch.py \
#                  use_mock_hardware:=false serial_port:=/dev/ttyUSB0

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, RegisterEventHandler
from launch.conditions import IfCondition
from launch.event_handlers import OnProcessExit
from launch.substitutions import (
    Command,
    FindExecutable,
    LaunchConfiguration,
    PathJoinSubstitution,
)
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    # ---------------- 可配置 launch 参数 ----------------
    declared_arguments = [
        DeclareLaunchArgument(
            "use_mock_hardware",
            default_value="true",
            description="true=mock 仿真（无硬件，WSL2 调试用）；false=实机串口驱动",
        ),
        DeclareLaunchArgument(
            "serial_port",
            default_value="/dev/ttyUSB0",
            description="实机驱动板串口设备名（use_mock_hardware:=false 时生效）",
        ),
        DeclareLaunchArgument(
            "baud_rate",
            default_value="115200",
            description="串口波特率",
        ),
        DeclareLaunchArgument(
            "use_rviz",
            default_value="false",
            description="是否同时打开 RViz2 可视化",
        ),
    ]

    use_mock_hardware = LaunchConfiguration("use_mock_hardware")
    serial_port = LaunchConfiguration("serial_port")
    baud_rate = LaunchConfiguration("baud_rate")
    use_rviz = LaunchConfiguration("use_rviz")

    pkg_share = FindPackageShare("smartcar_bringup")

    # ---------------- 用 xacro 展开 URDF ----------------
    # robot_description 是一个"运行时字符串"，由 xacro 命令即时生成，
    # 把 launch 参数透传进 xacro <arg>。
    robot_description_content = Command(
        [
            FindExecutable(name="xacro"),
            " ",
            PathJoinSubstitution([pkg_share, "urdf", "smartcar.urdf.xacro"]),
            " use_mock_hardware:=",
            use_mock_hardware,
            " serial_port:=",
            serial_port,
            " baud_rate:=",
            baud_rate,
        ]
    )
    robot_description = {
        "robot_description": ParameterValue(
            robot_description_content, value_type=str
        )
    }

    controllers_file = PathJoinSubstitution(
        [pkg_share, "config", "controllers.yaml"]
    )

    # ---------------- 节点定义 ----------------
    robot_state_publisher = Node(
        package="robot_state_publisher",
        executable="robot_state_publisher",
        output="both",
        parameters=[robot_description],
    )

    control_node = Node(
        package="controller_manager",
        executable="ros2_control_node",
        output="both",
        # controller_manager 同时需要 robot_description 和 controllers.yaml
        parameters=[robot_description, controllers_file],
    )

    joint_state_broadcaster_spawner = Node(
        package="controller_manager",
        executable="spawner",
        arguments=[
            "joint_state_broadcaster",
            "--controller-manager",
            "/controller_manager",
            # WSL2 /mnt/d 上服务响应偏慢，放宽等待时间避免误判失败。
            "--controller-manager-timeout",
            "60",
            "--service-call-timeout",
            "60",
        ],
    )

    mecanum_controller_spawner = Node(
        package="controller_manager",
        executable="spawner",
        arguments=[
            "mecanum_drive_controller",
            "--controller-manager",
            "/controller_manager",
            "--controller-manager-timeout",
            "60",
            "--service-call-timeout",
            "60",
        ],
    )

    # 先起 joint_state_broadcaster，退出（=加载成功）后再起运动控制器，
    # 避免两个 spawner 并发抢 controller_manager 服务导致偶发失败。
    delay_mecanum_after_jsb = RegisterEventHandler(
        event_handler=OnProcessExit(
            target_action=joint_state_broadcaster_spawner,
            on_exit=[mecanum_controller_spawner],
        )
    )

    rviz_node = Node(
        package="rviz2",
        executable="rviz2",
        name="rviz2",
        output="log",
        condition=IfCondition(use_rviz),
    )

    return LaunchDescription(
        declared_arguments
        + [
            robot_state_publisher,
            control_node,
            joint_state_broadcaster_spawner,
            delay_mecanum_after_jsb,
            rviz_node,
        ]
    )
