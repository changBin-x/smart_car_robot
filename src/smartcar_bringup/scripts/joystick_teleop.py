#!/usr/bin/env python3
"""将 Xbox 手柄输入转换为麦克纳姆底盘的 TwistStamped 指令。

Author: ChangBin bin_chang@qq.com
Date: 2026-08-09 18:44:20
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-08-09
Copyright (c) 2026 by ChangBin, All Rights Reserved.
Description: 统一处理左摇杆、D-pad、安全使能和 Turbo，并发布底盘参考速度。
"""

from dataclasses import dataclass, fields
import math
import time
from typing import Any

import rclpy
from geometry_msgs.msg import TwistStamped
from rclpy.node import Node
from sensor_msgs.msg import Joy


@dataclass(frozen=True)
class VelocityCommand:
    """保存平面速度和偏航角速度。"""

    linear_x: float = 0.0
    linear_y: float = 0.0
    angular_z: float = 0.0

    def is_zero(self) -> bool:
        """判断速度指令是否为零。"""
        return (
            self.linear_x == 0.0
            and self.linear_y == 0.0
            and self.angular_z == 0.0
        )


@dataclass(frozen=True)
class JoystickConfig:
    """保存手柄输入索引、速度和安全参数。"""

    axis_linear_x: int = 1
    axis_angular_z: int = 0
    dpad_mode: str = "auto"
    dpad_axis_horizontal: int = 6
    dpad_axis_vertical: int = 7
    dpad_button_up: int = 12
    dpad_button_down: int = 13
    dpad_button_left: int = 14
    dpad_button_right: int = 15
    dpad_deadzone: float = 0.5
    dpad_speed: float = 0.5
    dpad_turbo_speed: float = 1.0
    linear_x_scale: float = 0.5
    linear_x_turbo_scale: float = 1.0
    angular_z_scale: float = 1.5
    angular_z_turbo_scale: float = 3.0
    enable_button: int = 4
    require_enable_button: bool = True
    enable_turbo_button: int = 5
    input_timeout: float = 0.5

    def __post_init__(self) -> None:
        """校验手柄索引、死区、速度和超时参数。"""
        index_names = (
            "axis_linear_x",
            "axis_angular_z",
            "dpad_axis_horizontal",
            "dpad_axis_vertical",
            "dpad_button_up",
            "dpad_button_down",
            "dpad_button_left",
            "dpad_button_right",
            "enable_button",
            "enable_turbo_button",
        )
        for name in index_names:
            value = getattr(self, name)
            if not isinstance(value, int) or value < 0:
                raise ValueError(f"{name} 必须是非负整数")

        if self.dpad_mode not in ("auto", "buttons", "axes"):
            raise ValueError("dpad_mode 必须是 auto、buttons 或 axes")
        if (
            not math.isfinite(self.dpad_deadzone)
            or not 0.0 <= self.dpad_deadzone <= 1.0
        ):
            raise ValueError("dpad_deadzone 必须位于 [0.0, 1.0] 范围内")
        for name in (
            "dpad_speed",
            "dpad_turbo_speed",
            "linear_x_scale",
            "linear_x_turbo_scale",
            "angular_z_scale",
            "angular_z_turbo_scale",
            "input_timeout",
        ):
            value = getattr(self, name)
            if not math.isfinite(value) or value < 0.0:
                raise ValueError(f"{name} 必须是非负有限数")


def _safe_axis(joy: Any, index: int) -> float:
    """安全读取 Joy 轴；索引越界或数值异常时返回 0。"""
    try:
        if index < 0:
            return 0.0
        value = float(joy.axes[index])
    except (AttributeError, IndexError, TypeError, ValueError):
        return 0.0
    if not math.isfinite(value):
        return 0.0
    return max(-1.0, min(1.0, value))


def _safe_button(joy: Any, index: int) -> int:
    """安全读取 Joy 按钮；索引越界或数值异常时返回 0。"""
    try:
        if index < 0:
            return 0
        return 1 if int(joy.buttons[index]) else 0
    except (AttributeError, IndexError, TypeError, ValueError):
        return 0


def _sign(value: float) -> int:
    """把输入方向转换为 -1、0 或 1。"""
    if value > 0.0:
        return 1
    if value < 0.0:
        return -1
    return 0


def _read_dpad(joy: Any, config: JoystickConfig) -> tuple[int, int, bool]:
    """读取 D-pad，并返回前后、左右方向和是否存在有效输入。"""
    button_values = (
        _safe_button(joy, config.dpad_button_up),
        _safe_button(joy, config.dpad_button_down),
        _safe_button(joy, config.dpad_button_left),
        _safe_button(joy, config.dpad_button_right),
    )
    has_button_input = any(button_values)
    if config.dpad_mode in ("auto", "buttons") and has_button_input:
        linear_x = button_values[0] - button_values[1]
        linear_y = button_values[3] - button_values[2]
        return _sign(linear_x), _sign(linear_y), True

    if config.dpad_mode == "buttons":
        return 0, 0, False

    horizontal = _safe_axis(joy, config.dpad_axis_horizontal)
    vertical = _safe_axis(joy, config.dpad_axis_vertical)
    has_axis_input = (
        abs(horizontal) >= config.dpad_deadzone
        or abs(vertical) >= config.dpad_deadzone
    )
    if not has_axis_input:
        return 0, 0, False

    # 当前 Xbox joy_node 输出：上为 +1、下为 -1、左为 -1、右为 +1。
    return _sign(vertical), _sign(horizontal), True


def compute_command(
    joy: Any,
    config: JoystickConfig,
    now: float,
    received_at: float,
) -> VelocityCommand:
    """根据一次 Joy 消息计算安全速度指令。

    Args:
        joy: 包含 axes 和 buttons 成员的 Joy 消息或测试替身。
        config: 手柄索引、速度和安全参数。
        now: 当前单调时钟时间（秒）。
        received_at: 最近一条 Joy 消息的接收时间（秒）。

    Returns:
        经过安全门控和方向优先级处理后的速度指令。
    """
    if joy is None or now < received_at:
        return VelocityCommand()
    if now - received_at > config.input_timeout:
        return VelocityCommand()
    if config.require_enable_button and not _safe_button(joy, config.enable_button):
        return VelocityCommand()

    turbo = bool(_safe_button(joy, config.enable_turbo_button))
    dpad_x, dpad_y, has_dpad_input = _read_dpad(joy, config)
    dpad_speed = config.dpad_turbo_speed if turbo else config.dpad_speed
    if has_dpad_input:
        return VelocityCommand(
            linear_x=dpad_x * dpad_speed,
            linear_y=dpad_y * dpad_speed,
            angular_z=_safe_axis(joy, config.axis_angular_z)
            * (config.angular_z_turbo_scale if turbo else config.angular_z_scale),
        )

    angular_scale = (
        config.angular_z_turbo_scale if turbo else config.angular_z_scale
    )
    linear_scale = (
        config.linear_x_turbo_scale if turbo else config.linear_x_scale
    )
    return VelocityCommand(
        linear_x=_safe_axis(joy, config.axis_linear_x) * linear_scale,
        linear_y=0.0,
        angular_z=_safe_axis(joy, config.axis_angular_z) * angular_scale,
    )


class JoystickTeleopNode(Node):
    """统一处理 Xbox 手柄输入并发布底盘参考速度。"""

    def __init__(self) -> None:
        super().__init__("joystick_teleop_node")
        self._declare_parameters()
        self._config = self._read_config()
        self._frame_id = str(self.get_parameter("frame_id").value)
        publish_rate = float(self.get_parameter("publish_rate").value)
        if not math.isfinite(publish_rate) or publish_rate <= 0.0:
            raise ValueError("publish_rate 必须是正的有限数")
        self._last_joy: Joy | None = None
        self._last_joy_time = 0.0
        self._publisher = self.create_publisher(
            TwistStamped, "/mecanum_drive_controller/reference", 10
        )
        self.create_subscription(Joy, "/joy", self._on_joy, 10)
        self.create_timer(1.0 / publish_rate, self._publish_command)

    def _declare_parameters(self) -> None:
        """声明 YAML 中使用的 ROS 参数。"""
        defaults = JoystickConfig()
        for name, value in vars(defaults).items():
            self.declare_parameter(name, value)
        self.declare_parameter("frame_id", "base_footprint")
        self.declare_parameter("publish_rate", 20.0)

    def _read_config(self) -> JoystickConfig:
        """读取 ROS 参数并生成不可变配置对象。"""
        values = {
            field.name: self.get_parameter(field.name).value
            for field in fields(JoystickConfig)
        }
        return JoystickConfig(**values)

    def _on_joy(self, message: Joy) -> None:
        """保存最新手柄消息和接收时间。"""
        self._last_joy = message
        self._last_joy_time = time.monotonic()

    def _publish_command(self) -> None:
        """按固定频率发布速度，确保断开或超时时自动归零。"""
        now = time.monotonic()
        command = compute_command(
            self._last_joy, self._config, now, self._last_joy_time
        )
        message = TwistStamped()
        message.header.stamp = self.get_clock().now().to_msg()
        message.header.frame_id = self._frame_id
        message.twist.linear.x = command.linear_x
        message.twist.linear.y = command.linear_y
        message.twist.angular.z = command.angular_z
        self._publisher.publish(message)


def main() -> None:
    """启动手柄遥控节点。"""
    rclpy.init()
    node = JoystickTeleopNode()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
