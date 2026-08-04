"""测试 Web 遥测适配器的纯数据转换函数。

Author: ChangBin bin_chang@qq.com
Date: 2026-08-04
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-08-04
Copyright (c) 2026 by ChangBin, All Rights Reserved.
Description: 在不依赖 ROS 运行时的情况下验证里程计字段提取和 yaw 计算。
"""

import math
import unittest
from types import SimpleNamespace

from web_telemetry_adapter import extract_telemetry
from web_telemetry_adapter import quaternion_to_yaw


def make_odometry(
    x: float,
    y: float,
    yaw: float,
    linear_x: float,
    linear_y: float,
    angular_z: float,
) -> SimpleNamespace:
    """创建用于测试的最小 Odometry 形状对象。"""
    half_yaw = yaw / 2.0
    return SimpleNamespace(
        pose=SimpleNamespace(
            pose=SimpleNamespace(
                position=SimpleNamespace(x=x, y=y),
                orientation=SimpleNamespace(
                    x=0.0,
                    y=0.0,
                    z=math.sin(half_yaw),
                    w=math.cos(half_yaw),
                ),
            )
        ),
        twist=SimpleNamespace(
            twist=SimpleNamespace(
                linear=SimpleNamespace(x=linear_x, y=linear_y),
                angular=SimpleNamespace(z=angular_z),
            )
        ),
    )


class TelemetryExtractionTest(unittest.TestCase):
    """验证 Web 遥测字段提取行为。"""

    def test_extracts_planar_pose_and_velocity(self):
        result = extract_telemetry(
            make_odometry(1.2, -0.4, 0.75, 0.3, -0.2, 1.1)
        )

        self.assertAlmostEqual(result["x"], 1.2)
        self.assertAlmostEqual(result["y"], -0.4)
        self.assertAlmostEqual(result["yaw"], 0.75)
        self.assertAlmostEqual(result["linear_x"], 0.3)
        self.assertAlmostEqual(result["linear_y"], -0.2)
        self.assertAlmostEqual(result["angular_z"], 1.1)

    def test_missing_nested_fields_fall_back_to_zero(self):
        result = extract_telemetry(SimpleNamespace())

        self.assertEqual(
            result,
            {
                "x": 0.0,
                "y": 0.0,
                "yaw": 0.0,
                "linear_x": 0.0,
                "linear_y": 0.0,
                "angular_z": 0.0,
            },
        )

    def test_zero_quaternion_has_zero_yaw(self):
        message = make_odometry(0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        message.pose.pose.orientation = SimpleNamespace(
            x=0.0, y=0.0, z=0.0, w=0.0
        )

        result = extract_telemetry(message)

        self.assertEqual(result["yaw"], 0.0)

    def test_non_finite_values_fall_back_to_zero(self):
        message = make_odometry(
            math.nan,
            math.inf,
            0.0,
            -math.inf,
            math.nan,
            math.inf,
        )

        result = extract_telemetry(message)

        self.assertEqual(
            result,
            {
                "x": 0.0,
                "y": 0.0,
                "yaw": 0.0,
                "linear_x": 0.0,
                "linear_y": 0.0,
                "angular_z": 0.0,
            },
        )


class QuaternionToYawTest(unittest.TestCase):
    """验证四元数转 yaw 的防御性行为。"""

    def test_invalid_component_types_fall_back_to_zero(self):
        orientation = SimpleNamespace(
            x=None,
            y="invalid",
            z=0.0,
            w=1.0,
        )

        result = quaternion_to_yaw(orientation)

        self.assertEqual(result, 0.0)
