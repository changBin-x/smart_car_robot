# Copyright 2026 smart_car_robot
#
# motor_driver：四轮麦克纳姆小车的 ros2_control 硬件接口插件。
# 构建成一个 pluginlib 共享库，供 controller_manager 通过 URDF 里的
# <plugin>motor_driver/MecanumSystemHardware</plugin> 动态加载。

cmake_minimum_required(VERSION 3.16)
project(motor_driver LANGUAGES CXX)

# 硬件接口实现用到 <numbers>（std::numbers::pi），需要 C++20。
if(NOT CMAKE_CXX_STANDARD)
  set(CMAKE_CXX_STANDARD 20)
  set(CMAKE_CXX_STANDARD_REQUIRED ON)
endif()

# 验收标准要求"无警告"，这里开严格告警，把问题在编译期暴露。
if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

find_package(ament_cmake REQUIRED)
find_package(hardware_interface REQUIRED)
find_package(pluginlib REQUIRED)
find_package(rclcpp REQUIRED)
find_package(rclcpp_lifecycle REQUIRED)

# ---- 硬件接口共享库 ----
# 三个源文件分别对应文档里的三层：硬件接口 / 协议 / 串口传输。
add_library(${PROJECT_NAME} SHARED
  src/mecanum_system_hardware.cpp
  src/protocol.cpp
  src/serial_port.cpp
)

target_include_directories(${PROJECT_NAME} PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>
)

ament_target_dependencies(${PROJECT_NAME}
  hardware_interface
  pluginlib
  rclcpp
  rclcpp_lifecycle
)

# 向 hardware_interface 注册本插件描述文件，controller_manager 才能发现它。
pluginlib_export_plugin_description_file(hardware_interface motor_driver.xml)

# ---- 安装 ----
install(
  DIRECTORY include/
  DESTINATION include
)

install(
  TARGETS ${PROJECT_NAME}
  EXPORT export_${PROJECT_NAME}
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME DESTINATION bin
)

# ---- 单元测试（协议层纯逻辑，无需硬件） ----
if(BUILD_TESTING)
  find_package(ament_cmake_gtest REQUIRED)

  ament_add_gtest(test_protocol test/test_protocol.cpp)
  target_include_directories(test_protocol PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
  )
  # 测试只依赖协议层，单独编译 protocol.cpp，避免拉入串口/ROS 依赖。
  target_sources(test_protocol PRIVATE src/protocol.cpp)
endif()

# 导出库与依赖，供下游包（如 smartcar_bringup）链接使用。
ament_export_include_directories(include)
ament_export_libraries(${PROJECT_NAME})
ament_export_targets(export_${PROJECT_NAME} HAS_LIBRARY_TARGET)
ament_export_dependencies(
  hardware_interface
  pluginlib
  rclcpp
  rclcpp_lifecycle
)

ament_package()
