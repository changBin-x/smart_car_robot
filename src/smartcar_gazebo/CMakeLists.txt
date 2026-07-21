# Copyright (c) 2026 by ChangBin, All Rights Reserved.
#
# smartcar_gazebo：Gazebo Harmonic 空世界 + 仿真 launch 资源包。
# 纯资源包（无编译产物），把 worlds/launch 安装到 share。

cmake_minimum_required(VERSION 3.16)
project(smartcar_gazebo)

find_package(ament_cmake REQUIRED)

# 安装资源目录到 install/share/smartcar_gazebo/，
# 供 FindPackageShare 与 gz_args 定位 empty.sdf。
install(
  DIRECTORY worlds launch
  DESTINATION share/${PROJECT_NAME}
)

ament_package()
