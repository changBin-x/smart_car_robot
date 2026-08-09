# Copyright 2026 smart_car_robot
#
# hik_camera_bringup：海康 USB 单目相机的 ROS 2 资源包装包。

cmake_minimum_required(VERSION 3.16)
project(hik_camera_bringup)

find_package(ament_cmake REQUIRED)
find_package(cv_bridge REQUIRED)
find_package(OpenCV REQUIRED COMPONENTS imgcodecs)
find_package(rclcpp REQUIRED)
find_package(sensor_msgs REQUIRED)
find_package(std_msgs REQUIRED)

add_library(
  jpeg_frame_validator
  src/jpeg_frame_validator.cc
)
target_compile_features(jpeg_frame_validator PUBLIC cxx_std_20)
target_include_directories(
  jpeg_frame_validator
  PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
)

add_executable(
  hik_mjpeg_decoder_node
  src/hik_mjpeg_decoder_node.cc
)
target_compile_features(hik_mjpeg_decoder_node PUBLIC cxx_std_20)
target_include_directories(
  hik_mjpeg_decoder_node
  PRIVATE include
)
target_link_libraries(
  hik_mjpeg_decoder_node
  jpeg_frame_validator
  ${OpenCV_LIBS}
)
ament_target_dependencies(
  hik_mjpeg_decoder_node
  cv_bridge
  rclcpp
  sensor_msgs
  std_msgs
)

# 安装相机桥接节点和运行时资源，供 ROS 2 运行时定位。
install(
  TARGETS hik_mjpeg_decoder_node jpeg_frame_validator
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME DESTINATION lib/${PROJECT_NAME}
)
install(
  DIRECTORY camera_info config doc launch
  DESTINATION share/${PROJECT_NAME}
)
install(
  DIRECTORY include/
  DESTINATION include
)

if(BUILD_TESTING)
  find_package(ament_cmake_gtest REQUIRED)
  find_package(ament_cmake_pytest REQUIRED)

  ament_add_gtest(
    test_jpeg_frame_validator
    test/test_jpeg_frame_validator.cc
  )
  target_include_directories(
    test_jpeg_frame_validator
    PRIVATE include
  )
  target_link_libraries(test_jpeg_frame_validator jpeg_frame_validator)

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
