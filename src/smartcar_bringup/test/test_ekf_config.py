"""EKF 里程计融合配置契约测试。

Author: ChangBin bin_chang@qq.com
Date: 2026-08-04
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-08-04
Copyright (c) 2026 by ChangBin, All Rights Reserved.
Description: 检查 robot_localization EKF 的坐标帧、输入话题和 IMU
    姿态使用策略，防止后续融合配置偏离计划约定。
"""

from pathlib import Path

import yaml


# 仓库根目录：test/ -> smartcar_bringup/ -> src/ -> repo root。
ROOT = Path(__file__).parents[3]

# EKF 参数文件；配置契约测试直接读取源码树中的 YAML。
CONFIG = ROOT / "src/smartcar_bringup/config/ekf_odom.yaml"
MPU6050_NODE = ROOT / "src/ros2_mpu6050/src/mpu6050_node.cpp"
MPU6050_PARAMS = ROOT / "src/ros2_mpu6050/config/params.yaml"
MPU6050_PACKAGE = ROOT / "src/ros2_mpu6050/package.xml"
WEB_ADAPTER = ROOT / "src/smartcar_bringup/scripts/web_telemetry_adapter.py"
BRINGUP_URDF = ROOT / "src/smartcar_bringup/urdf/smartcar.urdf.xacro"
BRINGUP_LAUNCH = ROOT / "src/smartcar_bringup/launch/smartcar.launch.py"
BRINGUP_CMAKE = ROOT / "src/smartcar_bringup/CMakeLists.txt"
BRINGUP_PACKAGE = ROOT / "src/smartcar_bringup/package.xml"


def test_ekf_uses_expected_frames_and_topics() -> None:
    """EKF 必须使用计划锁定的输出帧和原始传感器输入话题。"""
    config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    parameters = config["ekf_filter_node_odom"]["ros__parameters"]

    assert parameters["odom_frame"] == "odom"
    assert parameters["base_link_frame"] == "base_footprint"
    assert parameters["world_frame"] == "odom"
    assert parameters["odom0"] == "/mecanum_drive_controller/odometry"
    assert parameters["imu0"] == "/imu/data_raw"


def test_ekf_does_not_use_imu_absolute_orientation() -> None:
    """EKF 禁止使用 MPU6050 不具备磁力计支撑的绝对姿态。"""
    config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    parameters = config["ekf_filter_node_odom"]["ros__parameters"]

    assert parameters["imu0_config"][3:6] == [False, False, False]
    assert parameters["imu0_differential"] is False
    assert parameters["imu0_relative"] is False


def test_ekf_variable_masks_match_sensor_capabilities() -> None:
    """EKF 变量 mask 必须匹配轮速里程计与 MPU6050 能力。"""
    config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    parameters = config["ekf_filter_node_odom"]["ros__parameters"]

    assert len(parameters["odom0_config"]) == 15
    assert len(parameters["imu0_config"]) == 15
    assert parameters["odom0_config"][0:3] == [False, False, False]
    assert parameters["odom0_config"][3:6] == [False, False, False]
    assert parameters["odom0_config"][6:9] == [True, True, False]
    assert parameters["odom0_config"][9:12] == [False, False, True]
    assert parameters["imu0_config"][3:6] == [False, False, False]
    assert parameters["imu0_config"][9:12] == [False, False, True]
    assert parameters["imu0_config"][12:15] == [False, False, False]
    assert parameters["imu0_remove_gravitational_acceleration"] is False
    assert parameters["two_d_mode"] is True
    assert parameters["publish_tf"] is True


def test_controller_does_not_publish_competing_odom_tf() -> None:
    """底盘控制器不得与 EKF 重复发布 odom 动态 TF。"""
    controllers = yaml.safe_load(
        (
            ROOT / "src/smartcar_bringup/config/controllers.yaml"
        ).read_text(encoding="utf-8")
    )
    parameters = controllers["mecanum_drive_controller"]["ros__parameters"]

    assert parameters["enable_odom_tf"] is False


def test_bringup_launches_ekf_with_explicit_opt_in() -> None:
    """bringup 必须声明 robot_localization 依赖并可显式启动 EKF。"""
    package_xml = (
        ROOT / "src/smartcar_bringup/package.xml"
    ).read_text(encoding="utf-8")
    launch_text = BRINGUP_LAUNCH.read_text(encoding="utf-8")

    assert "<exec_depend>robot_localization</exec_depend>" in package_xml
    assert 'package="robot_localization"' in launch_text
    assert 'name="ekf_filter_node_odom"' in launch_text
    assert "ekf_odom.yaml" in launch_text
    assert "parameters=[ekf_params]" in launch_text
    assert "/odometry/filtered" in launch_text
    assert (
        'DeclareLaunchArgument(\n'
        '            "use_ekf",\n'
        '            default_value="false",'
    ) in launch_text
    assert 'LaunchConfiguration("use_ekf")' in launch_text
    assert "IfCondition(use_ekf)" in launch_text


def test_mpu6050_publishes_base_link_imu_with_expected_units() -> None:
    """MPU6050 驱动必须发布 base_link 坐标系下的 SI 单位 IMU。"""
    source_text = MPU6050_NODE.read_text(encoding="utf-8")

    assert 'message.header.frame_id = "base_link";' in source_text
    assert "(M_PI / 180.0)" in source_text
    assert "linear_acceleration_variance" in source_text
    assert "angular_velocity_variance" in source_text
    assert "message.orientation_covariance[0] = -1;" in source_text


def test_mpu6050_params_document_mounting_axes_and_units() -> None:
    """MPU6050 参数文件必须说明安装原点、坐标轴方向和输出单位。"""
    params_text = MPU6050_PARAMS.read_text(encoding="utf-8")

    assert "MPU6050 芯片中心必须安装在车体 base_link 原点" in params_text
    assert "MPU6050 使用右手系：+x 前方、+y 左方、+z 上方" in params_text
    assert "芯片丝印或板载坐标轴必须和车体坐标轴平行" in params_text
    assert "线加速度单位为 m/s^2" in params_text
    assert "角速度单位为 rad/s" in params_text
    assert "linear_acceleration_variance" in params_text
    assert "angular_velocity_variance" in params_text


def test_mpu6050_package_declares_build_and_runtime_dependencies() -> None:
    """MPU6050 包必须声明干净环境 rosdep 所需依赖。"""
    package_xml = MPU6050_PACKAGE.read_text(encoding="utf-8")

    assert "<build_depend>libi2c-dev</build_depend>" in package_xml
    assert "<exec_depend>libi2c-dev</exec_depend>" in package_xml
    assert "<build_depend>rclcpp</build_depend>" in package_xml
    assert "<exec_depend>rclcpp</exec_depend>" in package_xml
    assert "<build_depend>sensor_msgs</build_depend>" in package_xml
    assert "<exec_depend>sensor_msgs</exec_depend>" in package_xml


def test_web_telemetry_keeps_raw_odometry_as_input() -> None:
    """Web 遥测适配器必须继续订阅原始 Odometry。"""
    adapter_text = WEB_ADAPTER.read_text(encoding="utf-8")

    assert "/mecanum_drive_controller/odometry" in adapter_text
    assert "/odometry/filtered" not in adapter_text


def test_web_telemetry_uses_stamped_pose_message() -> None:
    """Web 遥测位姿必须使用 rosbridge 实机可序列化的带 Header 消息。"""
    adapter_text = WEB_ADAPTER.read_text(encoding="utf-8")

    assert "from geometry_msgs.msg import PoseStamped" in adapter_text
    assert "Pose2D" not in adapter_text
    assert '"/web/telemetry/pose"' in adapter_text


def test_urdf_has_static_base_footprint_to_base_link_joint() -> None:
    """URDF 必须保留 base_footprint 到 base_link 的固定连接。"""
    urdf_text = BRINGUP_URDF.read_text(encoding="utf-8")

    assert '<joint name="base_footprint_joint" type="fixed">' in urdf_text
    assert '<parent link="base_footprint"/>' in urdf_text
    assert '<child link="base_link"/>' in urdf_text


def test_bringup_camera_uses_explicit_hik_opt_in() -> None:
    """总启动必须默认不接触相机，且只能包含新的相机包装包。"""
    launch_text = BRINGUP_LAUNCH.read_text(encoding="utf-8")

    assert (
        'DeclareLaunchArgument(\n'
        '            "use_hik_camera",\n'
        '            default_value="false",'
    ) in launch_text
    assert (
        'DeclareLaunchArgument(\n'
        '            "use_web_preview",\n'
        '            default_value="false",'
    ) in launch_text
    assert 'FindPackageShare("hik_camera_bringup")' in launch_text
    assert "camera_ustreamer_ctl" not in launch_text
    assert "camera_stream_port" not in launch_text
    assert "camera_ctl_port" not in launch_text


def test_bringup_declares_new_camera_dependency_only() -> None:
    """bringup 必须依赖新包装包，并停止安装旧采集控制脚本。"""
    cmake_text = BRINGUP_CMAKE.read_text(encoding="utf-8")
    package_text = BRINGUP_PACKAGE.read_text(encoding="utf-8")

    assert "<exec_depend>hik_camera_bringup</exec_depend>" in package_text
    assert "camera_ustreamer_ctl.py" not in cmake_text
