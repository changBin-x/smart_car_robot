/**
 * Author: ChangBin bin_chang@qq.com
 * Date: 2026-07-21
 * LastEditors: ChangBin bin_chang@qq.com
 * LastEditTime: 2026-07-21
 * Copyright (c) 2026 by ChangBin, All Rights Reserved.
 * Description: MPU6050 ROS 2 节点实现：读 I2C 参数并发布 Imu
 */

#include "ros2_mpu6050/mpu6050_node.h"

#include <cerrno>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <string>

using namespace std::chrono_literals;

namespace {

/** 本项目默认：AD0 接 GND → 从地址 0x68。 */
constexpr std::uint8_t kDefaultI2cAddress = 0x68;

}  // namespace

Mpu6050Node::Mpu6050Node(const std::string& name) : Node(name) {
  // ---- I2C 连接参数（须在构造传感器对象之前读取）----
  this->declare_parameter<std::string>("i2c_device", "/dev/i2c-1");
  this->declare_parameter<std::string>("i2c_address", "0x68");

  // ---- 量程 / 滤波 / 时钟 ----
  this->declare_parameter<int>("gyro_fs_sel", 0);
  this->declare_parameter<int>("accel_afs_sel", 0);
  this->declare_parameter<int>("dlpf_cfg", 0);
  this->declare_parameter<int>("clock_src", 0);

  // ---- 标定偏移 ----
  this->declare_parameter<double>("gyro_x_offset", 0.0);
  this->declare_parameter<double>("gyro_y_offset", 0.0);
  this->declare_parameter<double>("gyro_z_offset", 0.0);
  this->declare_parameter<double>("accel_x_offset", 0.0);
  this->declare_parameter<double>("accel_y_offset", 0.0);
  this->declare_parameter<double>("accel_z_offset", 0.0);

  const std::string i2c_device =
      this->get_parameter("i2c_device").as_string();
  const std::uint8_t i2c_address = ParseI2cAddress(
      this->get_parameter("i2c_address").as_string(), kDefaultI2cAddress);

  RCLCPP_INFO(this->get_logger(),
              "Opening MPU6050 on %s address 0x%02X", i2c_device.c_str(),
              static_cast<unsigned>(i2c_address));

  mpu6050_dev_ = std::make_unique<Mpu6050>(i2c_device, i2c_address);

  gyro_x_offset_ = this->get_parameter("gyro_x_offset").as_double();
  gyro_y_offset_ = this->get_parameter("gyro_y_offset").as_double();
  gyro_z_offset_ = this->get_parameter("gyro_z_offset").as_double();
  accel_x_offset_ = this->get_parameter("accel_x_offset").as_double();
  accel_y_offset_ = this->get_parameter("accel_y_offset").as_double();
  accel_z_offset_ = this->get_parameter("accel_z_offset").as_double();

  mpu6050_dev_->Mpu6050_GyroFsSel(static_cast<Mpu6050::Mpu6050_FsSel_t>(
      this->get_parameter("gyro_fs_sel").as_int()));
  mpu6050_dev_->Mpu6050_AccelFsSel(static_cast<Mpu6050::Mpu6050_AfsSel_t>(
      this->get_parameter("accel_afs_sel").as_int()));
  mpu6050_dev_->Mpu6050_DlpfConfig(static_cast<Mpu6050::Mpu6050_DlpfCfg_t>(
      this->get_parameter("dlpf_cfg").as_int()));
  mpu6050_dev_->Mpu6050_ClockSelect(static_cast<Mpu6050::Mpu6050_ClkSrc_t>(
      this->get_parameter("clock_src").as_int()));

  publisher_ = this->create_publisher<sensor_msgs::msg::Imu>("imu/mpu6050", 10);
  timer_ = this->create_wall_timer(
      10ms, std::bind(&Mpu6050Node::ImuPubCallback, this));
}

std::uint8_t Mpu6050Node::ParseI2cAddress(const std::string& text,
                                          std::uint8_t default_addr) const {
  if (text.empty()) {
    RCLCPP_ERROR(this->get_logger(),
                 "i2c_address is empty, using default 0x%02X",
                 static_cast<unsigned>(default_addr));
    return default_addr;
  }

  char* end = nullptr;
  errno = 0;
  // 允许 "0x68"、"68"（十六进制）与 "104"（十进制）。
  const int base = (text.size() > 2 && text[0] == '0' &&
                    (text[1] == 'x' || text[1] == 'X'))
                       ? 16
                       : 0;  // base 0：0x 前缀→16，否则十进制
  const long value = std::strtol(text.c_str(), &end, base);
  if (errno != 0 || end == text.c_str() || *end != '\0' || value < 0 ||
      value > 0x7F) {
    RCLCPP_ERROR(this->get_logger(),
                 "invalid i2c_address '%s', using default 0x%02X", text.c_str(),
                 static_cast<unsigned>(default_addr));
    return default_addr;
  }
  return static_cast<std::uint8_t>(value);
}

void Mpu6050Node::ImuPubCallback() {
  auto message = sensor_msgs::msg::Imu();
  message.header.stamp = this->get_clock()->now();
  message.header.frame_id = "base_link";
  message.linear_acceleration_covariance = {0};

  Mpu6050::Mpu6050_AccelData_t AccelData;
  Mpu6050::Mpu6050_GyroData_t GyroData;

  mpu6050_dev_->Mpu6050_GetAccelData(AccelData);
  mpu6050_dev_->Mpu6050_GetGyroData(GyroData);

  message.linear_acceleration.x = AccelData.Accel_X - accel_x_offset_;
  message.linear_acceleration.y = AccelData.Accel_Y - accel_y_offset_;
  message.linear_acceleration.z = AccelData.Accel_Z - accel_z_offset_;
  message.angular_velocity_covariance[0] = {0};
  message.angular_velocity.x =
      (GyroData.Gyro_X - gyro_x_offset_) * (M_PI / 180.0);
  message.angular_velocity.y =
      (GyroData.Gyro_Y - gyro_y_offset_) * (M_PI / 180.0);
  message.angular_velocity.z =
      (GyroData.Gyro_Z - gyro_z_offset_) * (M_PI / 180.0);

  message.orientation_covariance[0] = -1;
  message.orientation.x = 0;
  message.orientation.y = 0;
  message.orientation.z = 0;
  message.orientation.w = 0;
  publisher_->publish(message);
}

int main(int argc, char* argv[]) {
  rclcpp::init(argc, argv);
  auto node = std::make_shared<Mpu6050Node>("mpu6050_sensor");
  rclcpp::spin(node);
  rclcpp::shutdown();
  return 0;
}
