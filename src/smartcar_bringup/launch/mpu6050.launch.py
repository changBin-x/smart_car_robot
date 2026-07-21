"""
Author: ChangBin bin_chang@qq.com
Date: 2026-07-21
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-07-21
Copyright (c) 2026 by ChangBin, All Rights Reserved.
Description: 启动 MPU6050 IMU 传感器驱动节点
-----------------------------------------------------------
通过工作空间内的 ros2_mpu6050 包发布 IMU 数据（非 submodule）。
配置 I2C 地址 0x68，发布话题 /imu/data_raw。

launch 参数：
  i2c_device (默认 /dev/i2c-1)：I2C 总线设备路径
  i2c_address (默认 0x68)：MPU6050 I2C 设备地址

用法：
  ros2 launch smartcar_bringup mpu6050.launch.py
  ros2 launch smartcar_bringup mpu6050.launch.py i2c_device:=/dev/i2c-1 i2c_address:=0x68
"""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    # 声明 launch 参数
    i2c_device_arg = DeclareLaunchArgument(
        "i2c_device",
        default_value="/dev/i2c-1",
        description="MPU6050 I2C 总线设备路径",
    )
    i2c_address_arg = DeclareLaunchArgument(
        "i2c_address",
        default_value="0x68",
        description="MPU6050 I2C 设备地址（AD0 接低电平=0x68，接高电平=0x69）",
    )

    mpu6050_params = PathJoinSubstitution(
        [FindPackageShare("ros2_mpu6050"), "config", "params.yaml"]
    )

    # MPU6050 驱动节点
    # 注意：YAML 会把 0x68 当成整数；必须强制为 string，与节点 declare 类型一致。
    mpu6050_node = Node(
        package="ros2_mpu6050",
        executable="ros2_mpu6050",
        name="mpu6050_sensor",
        output="screen",
        emulate_tty=True,
        parameters=[
            mpu6050_params,
            {
                "i2c_device": LaunchConfiguration("i2c_device"),
                "i2c_address": ParameterValue(
                    LaunchConfiguration("i2c_address"), value_type=str
                ),
            },
        ],
        remappings=[
            ("imu/mpu6050", "/imu/data_raw"),
        ],
    )

    return LaunchDescription(
        [
            i2c_device_arg,
            i2c_address_arg,
            mpu6050_node,
        ]
    )
