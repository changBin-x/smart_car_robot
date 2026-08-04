/**
 * Author: ChangBin bin_chang@qq.com
 * Date: 2026-07-21
 * LastEditors: ChangBin bin_chang@qq.com
 * LastEditTime: 2026-08-04
 * Copyright (c) 2026 by ChangBin, All Rights Reserved.
 * Description: MPU6050 ROS 2 节点头文件（发布 sensor_msgs/Imu）
 */

#ifndef MPU6050DRIVER_H
#define MPU6050DRIVER_H

#include <cstdint>
#include <memory>
#include <string>

#include "rclcpp/rclcpp.hpp"
#include "ros2_mpu6050/mpu6050.h"
#include "sensor_msgs/msg/imu.hpp"

/**
 * @brief MPU6050 IMU 发布节点。
 *
 * 通过参数 `i2c_device` / `i2c_address` 打开总线（默认 `/dev/i2c-1`、`0x68`），
 * 以约 100 Hz 发布 `imu/mpu6050`（可由 launch remap）。
 */
class Mpu6050Node : public rclcpp::Node {
 public:
  /**
   * @brief 构造节点并初始化传感器与定时发布器。
   * @param name 节点名（launch 可通过 `name=` 覆盖）。
   */
  explicit Mpu6050Node(const std::string& name);

 private:
  /**
   * @brief 将参数中的 I2C 地址解析为整数。
   *
   * 支持十进制（如 `104`）与十六进制字符串（如 `0x68` / `68`）。
   * @param text 参数字符串。
   * @param default_addr 解析失败时的回退地址。
   * @return 合法地址 0–127；非法时返回 default_addr 并打 ERROR 日志。
   */
  std::uint8_t ParseI2cAddress(const std::string& text,
                               std::uint8_t default_addr) const;

  /**
   * @brief 读取非负协方差参数。
   *
   * 非有限值或负数没有物理意义，会导致 EKF 过度信任或拒绝传感器。
   * @param parameter_name 参数名。
   * @param default_variance 参数非法时的回退方差。
   * @return 可用于 Imu 协方差矩阵对角线的非负方差。
   */
  double ReadNonNegativeVariance(const std::string& parameter_name,
                                 double default_variance) const;

  /** @brief 定时回调：读加速度/角速度并发布 Imu 消息。 */
  void ImuPubCallback();

  rclcpp::Publisher<sensor_msgs::msg::Imu>::SharedPtr publisher_;
  std::unique_ptr<Mpu6050> mpu6050_dev_;
  rclcpp::TimerBase::SharedPtr timer_;

  double gyro_x_offset_{0.0};
  double gyro_y_offset_{0.0};
  double gyro_z_offset_{0.0};
  double accel_x_offset_{0.0};
  double accel_y_offset_{0.0};
  double accel_z_offset_{0.0};
  double linear_acceleration_variance_{0.04};
  double angular_velocity_variance_{0.0004};
};

#endif  // MPU6050DRIVER_H
