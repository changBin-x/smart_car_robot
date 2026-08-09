"""启动海康 USB 单目相机与可选 Web 预览服务。

Author: ChangBin bin_chang@qq.com
Date: 2026-08-10
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-08-10
Copyright (c) 2026 by ChangBin, All Rights Reserved.
Description: 独占 V4L2 相机设备，采集原始 MJPEG 并发布标准 CameraInfo；
    通过受控 MJPEG 解码桥接发布标准 bgr8 图像，并可选地以
    web_video_server 提供低分辨率 MJPEG 预览。
"""

from typing import List

from launch import LaunchContext, LaunchDescription
from launch.actions import DeclareLaunchArgument, OpaqueFunction
from launch.conditions import IfCondition
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import ComposableNodeContainer, Node
from launch_ros.descriptions import ComposableNode
from launch_ros.parameter_descriptions import ParameterValue
from launch_ros.substitutions import FindPackageShare


def _parse_boolean(value: str, argument_name: str) -> bool:
    """将 launch 布尔参数转换为 Python 布尔值。

    Args:
        value: launch 上下文中解析后的字符串值。
        argument_name: 用于错误提示的参数名称。

    Returns:
        解析后的布尔值。

    Raises:
        ValueError: 参数值不是 ROS launch 支持的布尔文本时抛出。
    """
    normalized_value = value.strip().lower()
    if normalized_value in {"true", "1"}:
        return True
    if normalized_value in {"false", "0"}:
        return False
    raise ValueError(
        f"{argument_name} 必须为 true/false 或 1/0，当前值为：{value}"
    )


def _create_camera_nodes(context: LaunchContext) -> List[object]:
    """根据启动上下文创建相机与可选 Web 预览节点。

    Args:
        context: ROS 2 launch 的运行时上下文。

    Returns:
        要加入 LaunchDescription 的容器和节点列表。
    """
    use_cpu_affinity = LaunchConfiguration("use_cpu_affinity")
    camera_cpu_core = LaunchConfiguration("camera_cpu_core")
    use_web_preview = LaunchConfiguration("use_web_preview")
    web_port = LaunchConfiguration("web_port")
    web_address = LaunchConfiguration("web_address")
    camera_parameters = PathJoinSubstitution(
        [
            FindPackageShare("hik_camera_bringup"),
            "config",
            "hik_monocular.yaml",
        ]
    )
    decoder_parameters = PathJoinSubstitution(
        [
            FindPackageShare("hik_camera_bringup"),
            "config",
            "hik_mjpeg_decoder.yaml",
        ]
    )

    camera_prefix = []
    if _parse_boolean(
        use_cpu_affinity.perform(context), "use_cpu_affinity"
    ):
        # taskset 是普通优先级下的可选隔离措施；FIFO 仅能经 systemd 明确启用。
        camera_prefix = ["taskset", "-c", camera_cpu_core.perform(context)]

    camera_container = ComposableNodeContainer(
        package="rclcpp_components",
        executable="component_container_mt",
        name="hik_camera_container",
        namespace="/hik_monocular",
        output="screen",
        prefix=camera_prefix,
        composable_node_descriptions=[
            ComposableNode(
                package="usb_cam",
                plugin="usb_cam::UsbCamNode",
                name="usb_cam",
                namespace="driver",
                parameters=[camera_parameters],
                extra_arguments=[{"use_intra_process_comms": True}],
            ),
            ComposableNode(
                package="hik_camera_bringup",
                plugin="hik_camera_bringup::HikMjpegDecoderNode",
                name="hik_mjpeg_decoder_node",
                parameters=[decoder_parameters],
                extra_arguments=[{"use_intra_process_comms": True}],
            ),
        ],
    )
    web_video_node = Node(
        package="web_video_server",
        executable="web_video_server",
        name="web_video_server",
        output="screen",
        condition=IfCondition(use_web_preview),
        parameters=[
            {
                "address": web_address,
                "port": ParameterValue(web_port, value_type=int),
                "default_stream_type": "mjpeg",
                "server_threads": 1,
                "ros_threads": 1,
            }
        ],
    )
    return [camera_container, web_video_node]


def generate_launch_description() -> LaunchDescription:
    """生成海康 USB 单目相机的 ROS 2 启动描述。"""
    declared_arguments = [
        DeclareLaunchArgument(
            "use_cpu_affinity",
            default_value="false",
            description="是否通过 taskset 将相机组件容器绑定到指定 CPU 核",
        ),
        DeclareLaunchArgument(
            "camera_cpu_core",
            default_value="2",
            description="use_cpu_affinity:=true 时相机组件容器绑定的 CPU 核编号",
        ),
        DeclareLaunchArgument(
            "use_web_preview",
            default_value="false",
            description="是否启动 web_video_server 的 MJPEG 预览服务",
        ),
        DeclareLaunchArgument(
            "web_port",
            default_value="8080",
            description="web_video_server HTTP 监听端口",
        ),
        DeclareLaunchArgument(
            "web_address",
            default_value="0.0.0.0",
            description="web_video_server HTTP 监听地址",
        ),
    ]

    return LaunchDescription(
        declared_arguments + [OpaqueFunction(function=_create_camera_nodes)]
    )
