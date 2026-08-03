"""
Author: ChangBin bin_chang@qq.com
Date: 2026-08-03
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-08-03
Copyright (c) 2026 by ChangBin, All Rights Reserved.
Description: 一键启动四轮麦克纳姆小车控制栈与实机摄像头推流控制器
-----------------------------------------------------------
启动内容：
  1) robot_state_publisher —— 用 xacro 展开的 URDF 发布 robot_description + 静态 TF
  2) controller_manager    —— ros2_control 核心，加载硬件插件
  3) joint_state_broadcaster（spawner）
  4) mecanum_drive_controller（spawner，等 broadcaster 起来后再加载）
  5) battery_state_broadcaster（spawner，发布 /battery_state）
  6) mpu6050_sensor        —— MPU6050 IMU 驱动（I2C 地址 0x68）
  7) rosbridge_websocket   —— rosbridge_server 的 WebSocket 桥接（端口 9090）
  8) joy_teleop            —— Xbox 手柄遥控栈（可选参数 use_joy:=true 启动）
  9) camera_ustreamer_ctl  —— 单实例 ustreamer 摄像头推流与质量切换控制

launch 参数：
  use_mock_hardware (默认 true)：true=mock 仿真（WSL2），false=实机串口
  serial_port       (默认 /dev/ttyUSB0)：实机驱动板串口设备名
  baud_rate         (默认 115200)
  i2c_device        (默认 /dev/i2c-1)：MPU6050 I2C 总线
  i2c_address       (默认 0x68)：MPU6050 I2C 地址
  use_joy           (默认 false)：是否同时启动 Xbox 手柄遥控栈
  joy_dev           (默认 /dev/input/js0)：手柄设备节点路径
  use_camera        (默认 true)：实机时是否启动摄像头推流控制器
  camera_device     (默认 /dev/video0)：UVC 摄像头设备路径
  camera_stream_port(默认 8080)：ustreamer MJPEG HTTP 推流端口
  camera_ctl_port   (默认 8082)：摄像头质量切换 HTTP 控制端口

用法：
  WSL2 仿真：ros2 launch smartcar_bringup smartcar.launch.py
  实机：     ros2 launch smartcar_bringup smartcar.launch.py \
                use_mock_hardware:=false serial_port:=/dev/ttyUSB0 use_joy:=true
  说明：实机（use_mock_hardware:=false）时一并启动 MPU6050；
        WSL2 mock 模式不启 IMU（无 I2C 硬件）。
"""

from launch import LaunchDescription
from launch.actions import (
    DeclareLaunchArgument,
    IncludeLaunchDescription,
    RegisterEventHandler,
)
from launch.conditions import IfCondition, UnlessCondition
from launch.event_handlers import OnProcessExit
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_xml.launch_description_sources import XMLLaunchDescriptionSource
from launch.substitutions import (
    Command,
    FindExecutable,
    LaunchConfiguration,
    PathJoinSubstitution,
    PythonExpression,
)
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    """生成四轮麦克纳姆小车控制栈与可选外设 launch 描述。"""
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
        DeclareLaunchArgument(
            "i2c_device",
            default_value="/dev/i2c-1",
            description="MPU6050 I2C 总线设备路径（实机生效）",
        ),
        DeclareLaunchArgument(
            "i2c_address",
            default_value="0x68",
            description="MPU6050 I2C 地址（AD0 接 GND=0x68）",
        ),
        DeclareLaunchArgument(
            "use_joy",
            default_value="false",
            description="是否启动 Xbox 手柄遥控控制栈 (joy_node + teleop_twist_joy_node)",
        ),
        DeclareLaunchArgument(
            "joy_dev",
            default_value="/dev/input/js0",
            description="手柄 Linux 设备节点路径 (use_joy:=true 时生效)",
        ),
        DeclareLaunchArgument(
            "use_camera",
            default_value="true",
            description="实机时是否启动摄像头推流控制器",
        ),
        DeclareLaunchArgument(
            "camera_device",
            default_value="/dev/video0",
            description="UVC 摄像头设备路径 (use_camera:=true 且实机时生效)",
        ),
        DeclareLaunchArgument(
            "camera_stream_port",
            default_value="8080",
            description="ustreamer MJPEG HTTP 推流端口",
        ),
        DeclareLaunchArgument(
            "camera_ctl_port",
            default_value="8082",
            description="摄像头质量切换 HTTP 控制端口",
        ),
    ]

    use_mock_hardware = LaunchConfiguration("use_mock_hardware")
    serial_port = LaunchConfiguration("serial_port")
    baud_rate = LaunchConfiguration("baud_rate")
    use_rviz = LaunchConfiguration("use_rviz")
    i2c_device = LaunchConfiguration("i2c_device")
    i2c_address = LaunchConfiguration("i2c_address")
    use_joy = LaunchConfiguration("use_joy")
    joy_dev = LaunchConfiguration("joy_dev")
    use_camera = LaunchConfiguration("use_camera")
    camera_device = LaunchConfiguration("camera_device")
    camera_stream_port = LaunchConfiguration("camera_stream_port")
    camera_ctl_port = LaunchConfiguration("camera_ctl_port")

    pkg_share = FindPackageShare("smartcar_bringup")
    mpu6050_params = PathJoinSubstitution(
        [FindPackageShare("ros2_mpu6050"), "config", "params.yaml"]
    )

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
        "robot_description": ParameterValue(robot_description_content, value_type=str)
    }

    controllers_file = PathJoinSubstitution([pkg_share, "config", "controllers.yaml"])

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

    battery_state_broadcaster_spawner = Node(
        package="controller_manager",
        executable="spawner",
        arguments=[
            "battery_state_broadcaster",
            "--controller-manager",
            "/controller_manager",
            "--controller-manager-timeout",
            "60",
            "--service-call-timeout",
            "60",
            # 将控制器节点的 ~/battery_state remap 到全局 /battery_state
            "--controller-ros-args",
            "-r ~/battery_state:=/battery_state",
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

    # 电池广播器与运动控制器无接口冲突，可在 JSB 成功后并行拉起。
    delay_battery_after_jsb = RegisterEventHandler(
        event_handler=OnProcessExit(
            target_action=joint_state_broadcaster_spawner,
            on_exit=[battery_state_broadcaster_spawner],
        )
    )

    rviz_node = Node(
        package="rviz2",
        executable="rviz2",
        name="rviz2",
        output="log",
        condition=IfCondition(use_rviz),
    )

    # 实机才启 MPU6050（WSL2 mock 无 I2C）；话题 remap 到 /imu/data_raw
    mpu6050_node = Node(
        package="ros2_mpu6050",
        executable="ros2_mpu6050",
        name="mpu6050_sensor",
        output="screen",
        emulate_tty=True,
        condition=UnlessCondition(use_mock_hardware),
        parameters=[
            mpu6050_params,
            {
                "i2c_device": i2c_device,
                # YAML 会把 0x68 解析为整数，必须强制 string
                "i2c_address": ParameterValue(i2c_address, value_type=str),
            },
        ],
        remappings=[
            ("imu/mpu6050", "/imu/data_raw"),
        ],
    )

    # ---------------- rosbridge_server WebSocket 桥接 ----------------
    # 启动 WebSocket 桥接服务，暴露 9090 端口供 Web 上层与 ROS 2 通信
    rosbridge_launch = IncludeLaunchDescription(
        XMLLaunchDescriptionSource(
            PathJoinSubstitution(
                [
                    FindPackageShare("rosbridge_server"),
                    "launch",
                    "rosbridge_websocket_launch.xml",
                ]
            )
        )
    )

    # ---------------- Xbox 手柄遥控 (可选启动) ----------------
    # 参数 use_joy:=true 时一并拉起手柄驱动与 Twist 转换节点
    joy_teleop_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            PathJoinSubstitution([pkg_share, "launch", "joy_teleop.launch.py"])
        ),
        condition=IfCondition(use_joy),
        launch_arguments={"joy_dev": joy_dev}.items(),
    )

    # 摄像头只在实机路径启动；WSL2 mock 模式没有 /dev/video0 访问契约。
    camera_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            PathJoinSubstitution([pkg_share, "launch", "camera.launch.py"])
        ),
        condition=IfCondition(
            PythonExpression(
                [
                    "'",
                    use_camera,
                    "' == 'true' and '",
                    use_mock_hardware,
                    "' == 'false'",
                ]
            )
        ),
        launch_arguments={
            "camera_device": camera_device,
            "camera_stream_port": camera_stream_port,
            "camera_ctl_port": camera_ctl_port,
        }.items(),
    )

    return LaunchDescription(
        declared_arguments
        + [
            robot_state_publisher,
            control_node,
            joint_state_broadcaster_spawner,
            delay_mecanum_after_jsb,
            delay_battery_after_jsb,
            mpu6050_node,
            rviz_node,
            rosbridge_launch,
            joy_teleop_launch,
            camera_launch,
        ]
    )
