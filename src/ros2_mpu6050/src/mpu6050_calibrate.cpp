/**
 * @file mpu6050_calibrate.cpp
 * @brief 采集静止 MPU6050 数据并输出适用于 +z 向上坐标系的标定参数。
 * @author ChangBin <bin_chang@qq.com>
 */

#include "ros2_mpu6050/mpu6050.h"

#include <chrono>
#include <iostream>
#include <memory>
#include <thread>

namespace {

constexpr int kSampleCount = 500;
constexpr double kStandardGravity = 9.80665;
constexpr std::chrono::milliseconds kSampleInterval{10};

/** Holds static zero-bias offsets in the driver's native units. */
struct CalibrationOffsets {
  double gyro_x_offset{0.0};
  double gyro_y_offset{0.0};
  double gyro_z_offset{0.0};
  double accel_x_offset{0.0};
  double accel_y_offset{0.0};
  double accel_z_offset{0.0};
};

/** Collects static samples and calculates offsets without removing gravity. */
bool CollectCalibrationOffsets(CalibrationOffsets* offsets) {
  if (offsets == nullptr) {
    return false;
  }

  const auto mpu6050_dev = std::make_shared<Mpu6050>();
  Mpu6050::Mpu6050_AccelData_t accel_data;
  Mpu6050::Mpu6050_GyroData_t gyro_data;

  std::cout << "\n**** 开始 MPU6050 静态标定 ****" << std::endl;
  std::cout << "请保持车辆静止、水平，且 MPU6050 的 +z 轴朝上。" << std::endl;

  for (int sample_index = 0; sample_index < kSampleCount; ++sample_index) {
    const auto accel_status = mpu6050_dev->Mpu6050_GetAccelData(accel_data);
    const auto gyro_status = mpu6050_dev->Mpu6050_GetGyroData(gyro_data);
    if (accel_status != Mpu6050Hal::MPU6050_OK ||
        gyro_status != Mpu6050Hal::MPU6050_OK) {
      std::cerr << "读取 MPU6050 失败，未输出不完整的标定结果。" << std::endl;
      return false;
    }

    offsets->accel_x_offset += accel_data.Accel_X;
    offsets->accel_y_offset += accel_data.Accel_Y;
    offsets->accel_z_offset += accel_data.Accel_Z;
    offsets->gyro_x_offset += gyro_data.Gyro_X;
    offsets->gyro_y_offset += gyro_data.Gyro_Y;
    offsets->gyro_z_offset += gyro_data.Gyro_Z;

    std::this_thread::sleep_for(kSampleInterval);
  }

  offsets->accel_x_offset /= kSampleCount;
  offsets->accel_y_offset /= kSampleCount;
  offsets->accel_z_offset =
      offsets->accel_z_offset / kSampleCount - kStandardGravity;
  offsets->gyro_x_offset /= kSampleCount;
  offsets->gyro_y_offset /= kSampleCount;
  offsets->gyro_z_offset /= kSampleCount;
  return true;
}

/** Prints YAML values that retain the +z gravity reading at rest. */
void PrintCalibrationOffsets(const CalibrationOffsets& offsets) {
  std::cout << "\n将以下值写入 calibration.yaml：\n" << std::endl;
  std::cout << "Gyroscope Offsets (deg/s):\ngyro_x_offset --> "
            << offsets.gyro_x_offset << "\ngyro_y_offset --> "
            << offsets.gyro_y_offset << "\ngyro_z_offset --> "
            << offsets.gyro_z_offset << std::endl;
  std::cout << "\nAccelerometer Offsets (m/s^2):\naccel_x_offset --> "
            << offsets.accel_x_offset << "\naccel_y_offset --> "
            << offsets.accel_y_offset << "\naccel_z_offset --> "
            << offsets.accel_z_offset << std::endl;
  std::cout << "\n注意：accel_z_offset 已扣除标准重力，静止时发布的 z "
            << "仍应约为 +9.80665 m/s^2。" << std::endl;
}

}  // namespace

int main(int argc, char* argv[]) {
  (void)argc;
  (void)argv;

  CalibrationOffsets offsets;
  if (!CollectCalibrationOffsets(&offsets)) {
    return 1;
  }
  PrintCalibrationOffsets(offsets);

  return 0;
}
