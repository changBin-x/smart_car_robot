#!/usr/bin/env python3
"""将底盘里程计转换为 Web 遥测消息。

Author: ChangBin bin_chang@qq.com
Date: 2026-08-04
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-08-04
Copyright (c) 2026 by ChangBin, All Rights Reserved.
Description: 提取 Odometry 的二维位姿和速度，并发布轻量标准消息。
"""

from __future__ import annotations

import math
from copy import copy
from typing import Any

try:
    import rclpy
    from geometry_msgs.msg import Pose2D
    from geometry_msgs.msg import TwistStamped
    from nav_msgs.msg import Odometry
    from rclpy.node import Node
except ImportError:
    rclpy = None
    Pose2D = Any
    TwistStamped = Any
    Odometry = Any

    class Node:
        """ROS 不可用时供纯 Python 测试导入的占位基类。"""


ZERO_TELEMETRY = {
    "x": 0.0,
    "y": 0.0,
    "yaw": 0.0,
    "linear_x": 0.0,
    "linear_y": 0.0,
    "angular_z": 0.0,
}


def _finite_value(value: Any) -> float:
    """将有限数值转换为 float，其他输入统一返回 0.0。"""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return number if math.isfinite(number) else 0.0


def quaternion_to_yaw(orientation: Any) -> float:
    """将四元数转换为平面 yaw；非法输入返回 0.0。"""
    if orientation is None:
        return 0.0

    components = [
        _finite_value(getattr(orientation, name, None))
        for name in ("x", "y", "z", "w")
    ]
    x, y, z, w = components
    if not any(components) or not all(
        math.isfinite(getattr(orientation, name, float("nan")))
        for name in ("x", "y", "z", "w")
    ):
        return 0.0

    yaw = math.atan2(
        2.0 * (w * z + x * y),
        1.0 - 2.0 * (y * y + z * z),
    )
    return yaw if math.isfinite(yaw) else 0.0


def extract_telemetry(message: Any) -> dict[str, float]:
    """从 Odometry 提取二维位置、速度和 yaw。"""
    result = ZERO_TELEMETRY.copy()
    if message is None:
        return result

    pose = getattr(getattr(message, "pose", None), "pose", None)
    position = getattr(pose, "position", None)
    orientation = getattr(pose, "orientation", None)
    twist = getattr(getattr(message, "twist", None), "twist", None)
    linear = getattr(twist, "linear", None)
    angular = getattr(twist, "angular", None)

    result["x"] = _finite_value(getattr(position, "x", None))
    result["y"] = _finite_value(getattr(position, "y", None))
    result["yaw"] = quaternion_to_yaw(orientation)
    result["linear_x"] = _finite_value(getattr(linear, "x", None))
    result["linear_y"] = _finite_value(getattr(linear, "y", None))
    result["angular_z"] = _finite_value(getattr(angular, "z", None))
    return result


class WebTelemetryAdapter(Node):
    """将底盘 Odometry 转换为 Web 遥测标准消息。"""

    def __init__(self) -> None:
        """初始化发布器和里程计订阅。"""
        super().__init__("web_telemetry_adapter")
        self.twist_publisher = self.create_publisher(
            TwistStamped,
            "/web/telemetry/twist",
            10,
        )
        self.pose_publisher = self.create_publisher(
            Pose2D,
            "/web/telemetry/pose2d",
            10,
        )
        self.subscription = self.create_subscription(
            Odometry,
            "/mecanum_drive_controller/odometry",
            self.odometry_callback,
            10,
        )

    def odometry_callback(self, message: Odometry) -> None:
        """转换并发布一条里程计消息，异常时保持节点继续运行。"""
        try:
            telemetry = extract_telemetry(message)

            twist_message = TwistStamped()
            twist_message.header = copy(message.header)
            twist_message.twist.linear.x = telemetry["linear_x"]
            twist_message.twist.linear.y = telemetry["linear_y"]
            twist_message.twist.angular.z = telemetry["angular_z"]
            self.twist_publisher.publish(twist_message)

            pose_message = Pose2D()
            pose_message.x = telemetry["x"]
            pose_message.y = telemetry["y"]
            pose_message.theta = telemetry["yaw"]
            self.pose_publisher.publish(pose_message)
        except Exception as error:
            self.get_logger().error(
                f"处理里程计遥测失败，已忽略当前消息: {error}"
            )


def main(args: list[str] | None = None) -> None:
    """启动 Web 遥测适配节点。"""
    if rclpy is None:
        raise RuntimeError("ROS 2 运行时不可用，无法启动 WebTelemetryAdapter")

    rclpy.init(args=args)
    node = WebTelemetryAdapter()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
