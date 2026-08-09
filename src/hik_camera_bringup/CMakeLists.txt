# Copyright 2026 smart_car_robot
#
# hik_camera_bringup：海康 USB 单目相机的 ROS 2 资源包装包。

cmake_minimum_required(VERSION 3.16)
project(hik_camera_bringup)

find_package(ament_cmake REQUIRED)

# 安装相机参数、CameraInfo 占位、启动和验证说明，供 ROS 2 运行时定位。
install(
  DIRECTORY camera_info config doc launch
  DESTINATION share/${PROJECT_NAME}
)

if(BUILD_TESTING)
  find_package(ament_cmake_pytest REQUIRED)
  ament_add_pytest_test(
    test_hik_camera_contract
    test/test_hik_camera_contract.py
  )
  ament_add_pytest_test(
    test_hik_camera_documentation
    test/test_hik_camera_documentation.py
  )
endif()

ament_package()
