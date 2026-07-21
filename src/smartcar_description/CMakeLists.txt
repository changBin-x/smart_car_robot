# Copyright (c) 2026 by ChangBin, All Rights Reserved.
#
# smartcar_description：网格模型 + URDF/xacro + RViz 显示资源包。
# 纯资源包（无编译产物），把 meshes/urdf/launch/rviz 安装到 share。

cmake_minimum_required(VERSION 3.16)
project(smartcar_description)

find_package(ament_cmake REQUIRED)

# 安装资源目录到 install/share/smartcar_description/，
# 供 FindPackageShare 与 package://smartcar_description/... 定位。
install(
  DIRECTORY meshes urdf launch rviz
  DESTINATION share/${PROJECT_NAME}
)

ament_package()
