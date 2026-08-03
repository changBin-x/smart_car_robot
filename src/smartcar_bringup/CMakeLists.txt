# Copyright 2026 smart_car_robot
#
# smartcar_bringup：模型 + 控制器配置 + 启动包。
# 纯资源包（无编译产物），只需把 urdf/config/launch 安装到 share 目录，
# 供 ros2 launch 和 xacro $(find ...) 定位。

cmake_minimum_required(VERSION 3.16)
project(smartcar_bringup)

find_package(ament_cmake REQUIRED)

# 安装资源目录到 install/share/smartcar_bringup/ 下，
# launch 里的 FindPackageShare 与 xacro 的 $(find ...) 都靠这个定位。
install(
  DIRECTORY urdf config launch doc
  DESTINATION share/${PROJECT_NAME}
)

install(
  PROGRAMS scripts/camera_ustreamer_ctl.py
  DESTINATION lib/${PROJECT_NAME}
)

ament_package()
