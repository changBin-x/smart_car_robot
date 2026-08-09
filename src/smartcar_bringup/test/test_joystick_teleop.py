"""测试 Xbox 手柄摇杆与方向键到速度指令的映射。"""

from dataclasses import replace
from pathlib import Path
import sys
from types import SimpleNamespace

import yaml


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts"
CONFIG_PATH = Path(__file__).resolve().parents[1] / "config/xbox_teleop.yaml"
sys.path.insert(0, str(SCRIPT_PATH))

from joystick_teleop import JoystickConfig, compute_command  # noqa: E402


def test_yaml_dpad_button_indices_match_xbox_controller() -> None:
    """YAML 必须保持实测的 Xbox D-pad 按钮索引顺序。"""
    config = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    parameters = config["joystick_teleop_node"]["ros__parameters"]

    assert parameters["dpad_button_up"] == 12
    assert parameters["dpad_button_down"] == 13
    assert parameters["dpad_button_left"] == 14
    assert parameters["dpad_button_right"] == 15


def make_joy(*, axes=None, buttons=None):
    """创建最小化的 Joy 消息替身。"""
    return SimpleNamespace(axes=axes or [], buttons=buttons or [])


def make_enabled_joy(*, axes=None, buttons=None):
    """创建按住 LB 的最小化 Joy 消息替身。"""
    values = list(buttons or [])
    while len(values) <= 4:
        values.append(0)
    values[4] = 1
    return make_joy(axes=axes, buttons=values)


def test_dpad_buttons_map_cardinal_translation() -> None:
    """D-pad 四个按钮应输出对应的恒速平移分量。"""
    config = JoystickConfig()

    up = [0] * 13
    up[12] = 1
    result = compute_command(make_enabled_joy(buttons=up), config, 1.0, 1.0)
    assert (result.linear_x, result.linear_y) == (0.5, 0.0)

    left = [0] * 15
    left[14] = 1
    result = compute_command(make_enabled_joy(buttons=left), config, 1.0, 1.0)
    assert (result.linear_x, result.linear_y) == (0.0, 0.5)


def test_dpad_axis_is_fallback_and_is_digitalized() -> None:
    """没有按钮输入时，D-pad 轴应回退为恒速方向。"""
    axes = [0.0] * 8
    axes[6] = -0.8
    axes[7] = -0.9
    result = compute_command(make_enabled_joy(axes=axes), JoystickConfig(), 1.0, 1.0)
    assert (result.linear_x, result.linear_y) == (0.5, 0.5)


def test_dpad_button_has_priority_over_dpad_axis() -> None:
    """按钮输入存在时，按钮方向应覆盖轴方向。"""
    axes = [0.0] * 8
    axes[7] = 1.0
    buttons = [0] * 13
    buttons[12] = 1
    result = compute_command(
        make_enabled_joy(axes=axes, buttons=buttons), JoystickConfig(), 1.0, 1.0
    )
    assert (result.linear_x, result.linear_y) == (0.5, 0.0)


def test_dpad_has_priority_and_right_stick_is_ignored() -> None:
    """D-pad 应覆盖左摇杆平移，右摇杆不得改变输出。"""
    axes = [0.0] * 8
    axes[1] = 1.0
    axes[2] = 1.0
    axes[3] = -1.0
    buttons = [0] * 13
    buttons[12] = 1
    result = compute_command(
        make_enabled_joy(axes=axes, buttons=buttons), JoystickConfig(), 1.0, 1.0
    )
    assert (result.linear_x, result.linear_y) == (0.5, 0.0)


def test_left_stick_rotation_and_turbo_are_preserved() -> None:
    """左摇杆旋转和 RB Turbo 应继续生效。"""
    axes = [0.0] * 2
    axes[0] = -1.0
    axes[1] = 0.5
    buttons = [0] * 6
    buttons[5] = 1
    result = compute_command(
        make_enabled_joy(axes=axes, buttons=buttons), JoystickConfig(), 1.0, 1.0
    )
    assert result.linear_x == 0.5
    assert result.angular_z == -3.0


def test_opposite_directions_cancel() -> None:
    """同时按相反方向时对应平移分量应抵消。"""
    buttons = [0] * 16
    buttons[12] = 1
    buttons[13] = 1
    buttons[14] = 1
    buttons[15] = 1
    result = compute_command(
        make_enabled_joy(buttons=buttons), JoystickConfig(), 1.0, 1.0
    )
    assert (result.linear_x, result.linear_y) == (0.0, 0.0)


def test_enable_timeout_and_invalid_indices_are_safe() -> None:
    """未使能、超时和数组越界都必须输出零速度。"""
    config = replace(JoystickConfig(), input_timeout=0.2)
    joy = make_joy(axes=[1.0], buttons=[])
    assert compute_command(joy, config, 1.0, 1.0).is_zero()

    enabled = make_enabled_joy(axes=[1.0], buttons=[])
    assert compute_command(enabled, config, 1.3, 1.0).is_zero()


def test_out_of_range_axis_cannot_exceed_configured_speed() -> None:
    """异常轴值必须被限制，不能产生超出配置的速度。"""
    axes = [10.0, 10.0]
    result = compute_command(
        make_enabled_joy(axes=axes), JoystickConfig(), 1.0, 1.0
    )
    assert result.linear_x == 0.5
    assert result.angular_z == 1.5
