/**
 * Author: ChangBin bin_chang@qq.com
 * Date: 2026-07-17
 * LastEditors: ChangBin bin_chang@qq.com
 * LastEditTime: 2026-07-17
 * Copyright (c) 2026 by ChangBin, All Rights Reserved.
 * Description: MecanumSystemHardware 实现，与 mecanum_system_hardware.hpp
 * 配对阅读
 */
// 单位换算公式来自 docs/协议总结.md §5：
//   position [rad]   = 2π × 累计计数 / CPR
//   velocity [rad/s] = 2π × (10ms 增量) / CPR / 0.01
//   $spd 值 [mm/s]   = 命令 [rad/s] × r [m] × 1000

#include "motor_driver/mecanum_system_hardware.hpp"

#include <cmath>
#include <numbers>
#include <optional>
#include <stdexcept>
#include <utility>

#include "hardware_interface/types/hardware_interface_type_values.hpp"
#include "rclcpp/rclcpp.hpp"

namespace motor_driver {

namespace {

// 本驱动约定的关节名 → 驱动板电机编号（协议总结 §2 的映射表）。
// 数组下标即电机下标：0=M1 左前, 1=M2 左后, 2=M3 右前, 3=M4 右后。
constexpr std::array<const char *, protocol::kMotorCount> kExpectedJointNames =
    {"front_left_wheel_joint", "rear_left_wheel_joint",
     "front_right_wheel_joint", "rear_right_wheel_joint"};

constexpr double kTwoPi = 2.0 * std::numbers::pi;

// $MTEP 帧是"每 10 ms 的增量计数"，换算角速度时用这个周期。
constexpr double kDeltaPeriodSec = 0.01;

// 配置指令发出后等待 "OK" 应答的时间。配置只在 on_configure 做，
// 不在控制循环里，所以可以比 read/write 超时宽松。
constexpr std::chrono::milliseconds kConfigReplyTimeout{200};

// 从 <param> 表中取整数/浮点参数的小工具。key 不存在返回默认值；
// 存在但解析失败返回 nullopt（让上层报错，避免静默用错参数）。
std::optional<int>
get_int_param(const std::unordered_map<std::string, std::string> &params,
              const std::string &key, int default_value) {
  const auto it = params.find(key);
  if (it == params.end()) {
    return default_value;
  }
  try {
    size_t consumed = 0;
    const int value = std::stoi(it->second, &consumed);
    if (consumed != it->second.size()) {
      return std::nullopt;
    }
    return value;
  } catch (const std::exception &) {
    return std::nullopt;
  }
}

std::optional<double>
get_double_param(const std::unordered_map<std::string, std::string> &params,
                 const std::string &key, double default_value) {
  const auto it = params.find(key);
  if (it == params.end()) {
    return default_value;
  }
  try {
    size_t consumed = 0;
    const double value = std::stod(it->second, &consumed);
    if (consumed != it->second.size()) {
      return std::nullopt;
    }
    return value;
  } catch (const std::exception &) {
    return std::nullopt;
  }
}

} // namespace

MecanumSystemHardware::~MecanumSystemHardware() {
  // 兜底：进程退出前尽力停车，防止小车带着最后一条速度指令跑飞。
  if (serial_.is_open()) {
    send_stop_command();
    serial_.close();
  }
}

rclcpp::Logger MecanumSystemHardware::logger() const {
  return rclcpp::get_logger("MecanumSystemHardware");
}

hardware_interface::CallbackReturn MecanumSystemHardware::on_init(
    const hardware_interface::HardwareComponentInterfaceParams &params) {
  // 先让基类解析 params（填充 info_、绑定 executor 等）。
  if (SystemInterface::on_init(params) !=
      hardware_interface::CallbackReturn::SUCCESS) {
    return hardware_interface::CallbackReturn::ERROR;
  }

  // 后续校验一律以基类解析好的 HardwareInfo 为准。
  const hardware_interface::HardwareInfo &info = get_hardware_info();

  if (!load_parameters(info)) {
    return hardware_interface::CallbackReturn::ERROR;
  }
  if (!validate_joints(info)) {
    return hardware_interface::CallbackReturn::ERROR;
  }

  counts_per_rev_ = static_cast<double>(encoder_lines_) *
                    static_cast<double>(gear_ratio_) *
                    static_cast<double>(count_multiplier_);
  if (counts_per_rev_ <= 0.0) {
    RCLCPP_ERROR(logger(),
                 "invalid CPR %.1f (encoder_lines=%d gear_ratio=%d "
                 "count_multiplier=%d), all must be positive",
                 counts_per_rev_, encoder_lines_, gear_ratio_,
                 count_multiplier_);
    return hardware_interface::CallbackReturn::ERROR;
  }

  position_rad_.fill(0.0);
  velocity_rad_s_.fill(0.0);
  command_rad_s_.fill(0.0);

  RCLCPP_INFO(
      logger(), "initialized: port=%s baud=%d CPR=%.1f wheel_radius=%.3fm",
      serial_port_name_.c_str(), baud_rate_, counts_per_rev_, wheel_radius_m_);
  return hardware_interface::CallbackReturn::SUCCESS;
}

bool MecanumSystemHardware::load_parameters(
    const hardware_interface::HardwareInfo &info) {
  const auto &params = info.hardware_parameters;

  // 字符串参数直接取。
  const auto port_it = params.find("serial_port");
  if (port_it != params.end()) {
    serial_port_name_ = port_it->second;
  }

  // 数值参数逐个取；任何一个解析失败都算配置错误。
  struct IntItem {
    const char *key;
    int *target;
  };
  const IntItem int_items[] = {
      {"baud_rate", &baud_rate_},
      {"motor_type", &motor_type_},
      {"encoder_lines", &encoder_lines_},
      {"gear_ratio", &gear_ratio_},
      {"count_multiplier", &count_multiplier_},
      {"deadzone", &deadzone_},
      {"read_timeout_ms", &read_timeout_ms_},
      {"write_timeout_ms", &write_timeout_ms_},
      {"max_read_misses", &max_read_misses_},
  };
  for (const auto &item : int_items) {
    const auto value = get_int_param(params, item.key, *item.target);
    if (!value.has_value()) {
      RCLCPP_ERROR(logger(), "parameter '%s' is not a valid integer", item.key);
      return false;
    }
    *item.target = *value;
  }

  const auto radius = get_double_param(params, "wheel_radius", wheel_radius_m_);
  if (!radius.has_value() || *radius <= 0.0) {
    RCLCPP_ERROR(logger(), "parameter 'wheel_radius' must be a positive "
                           "number in meters");
    return false;
  }
  wheel_radius_m_ = *radius;

  // 方向系数：4 个 ±1，键名 direction_m1 ~ direction_m4。
  const std::array<const char *, protocol::kMotorCount> direction_keys = {
      "direction_m1", "direction_m2", "direction_m3", "direction_m4"};
  for (int i = 0; i < protocol::kMotorCount; ++i) {
    const auto value =
        get_double_param(params, direction_keys[i], direction_[i]);
    if (!value.has_value() || (*value != 1.0 && *value != -1.0)) {
      RCLCPP_ERROR(logger(), "parameter '%s' must be 1 or -1",
                   direction_keys[i]);
      return false;
    }
    direction_[i] = *value;
  }

  if (read_timeout_ms_ <= 0 || read_timeout_ms_ > 20 ||
      write_timeout_ms_ <= 0 || write_timeout_ms_ > 20) {
    RCLCPP_ERROR(logger(),
                 "read/write timeout must be in (0, 20] ms, got %d / %d",
                 read_timeout_ms_, write_timeout_ms_);
    return false;
  }
  return true;
}

bool MecanumSystemHardware::validate_joints(
    const hardware_interface::HardwareInfo &info) const {
  if (info.joints.size() != protocol::kMotorCount) {
    RCLCPP_ERROR(logger(), "expected %d joints in <ros2_control>, got %zu",
                 protocol::kMotorCount, info.joints.size());
    return false;
  }

  for (int motor = 0; motor < protocol::kMotorCount; ++motor) {
    // 在 URDF 关节列表里找当前电机对应的关节名。
    bool found = false;
    for (size_t j = 0; j < info.joints.size(); ++j) {
      if (info.joints[j].name == kExpectedJointNames[motor]) {
        // 这里只校验关节名存在；导出接口时会再按名字绑定内存，
        // 因此不需要在这里保存下标映射。
        found = true;
        break;
      }
    }
    if (!found) {
      RCLCPP_ERROR(logger(), "joint '%s' is missing in <ros2_control> tag",
                   kExpectedJointNames[motor]);
      return false;
    }
  }

  // 每个关节必须恰好是 1 个 velocity 命令 + position/velocity 两个状态。
  for (const auto &joint : info.joints) {
    if (joint.command_interfaces.size() != 1 ||
        joint.command_interfaces[0].name !=
            hardware_interface::HW_IF_VELOCITY) {
      RCLCPP_ERROR(logger(),
                   "joint '%s' must have exactly one 'velocity' command "
                   "interface",
                   joint.name.c_str());
      return false;
    }
    if (joint.state_interfaces.size() != 2 ||
        joint.state_interfaces[0].name != hardware_interface::HW_IF_POSITION ||
        joint.state_interfaces[1].name != hardware_interface::HW_IF_VELOCITY) {
      RCLCPP_ERROR(logger(),
                   "joint '%s' must have state interfaces "
                   "['position', 'velocity'] in this order",
                   joint.name.c_str());
      return false;
    }
  }
  return true;
}

std::vector<hardware_interface::StateInterface>
MecanumSystemHardware::export_state_interfaces() {
  std::vector<hardware_interface::StateInterface> interfaces;
  interfaces.reserve(protocol::kMotorCount * 2);
  for (int motor = 0; motor < protocol::kMotorCount; ++motor) {
    interfaces.emplace_back(kExpectedJointNames[motor],
                            hardware_interface::HW_IF_POSITION,
                            &position_rad_[motor]);
    interfaces.emplace_back(kExpectedJointNames[motor],
                            hardware_interface::HW_IF_VELOCITY,
                            &velocity_rad_s_[motor]);
  }
  return interfaces;
}

std::vector<hardware_interface::CommandInterface>
MecanumSystemHardware::export_command_interfaces() {
  std::vector<hardware_interface::CommandInterface> interfaces;
  interfaces.reserve(protocol::kMotorCount);
  for (int motor = 0; motor < protocol::kMotorCount; ++motor) {
    interfaces.emplace_back(kExpectedJointNames[motor],
                            hardware_interface::HW_IF_VELOCITY,
                            &command_rad_s_[motor]);
  }
  return interfaces;
}

hardware_interface::CallbackReturn MecanumSystemHardware::on_configure(
    const rclcpp_lifecycle::State & /*previous_state*/) {
  if (!serial_.open(serial_port_name_, baud_rate_)) {
    RCLCPP_ERROR(logger(), "failed to open serial port: %s",
                 serial_.last_error().c_str());
    return hardware_interface::CallbackReturn::ERROR;
  }

  // 自愈式配置：每次启动都把电机参数写一遍（断电保存，重复写无害），
  // 这样换新驱动板/被别的程序改过配置后系统仍能正常工作。
  const std::array<std::string, 5> config_commands = {
      protocol::make_motor_type_command(motor_type_),
      protocol::make_encoder_lines_command(encoder_lines_),
      protocol::make_gear_ratio_command(gear_ratio_),
      protocol::make_wheel_diameter_command(wheel_radius_m_ * 2000.0),
      protocol::make_deadzone_command(deadzone_),
  };
  for (const auto &command : config_commands) {
    if (!send_config_command(command)) {
      RCLCPP_ERROR(logger(), "board did not acknowledge config command '%s'",
                   command.c_str());
      serial_.close();
      return hardware_interface::CallbackReturn::ERROR;
    }
  }

  RCLCPP_INFO(logger(), "serial port %s configured at %d baud",
              serial_port_name_.c_str(), baud_rate_);
  return hardware_interface::CallbackReturn::SUCCESS;
}

bool MecanumSystemHardware::send_config_command(const std::string &command) {
  serial_.flush_buffers();
  if (!serial_.write_all(command,
                         std::chrono::milliseconds(write_timeout_ms_))) {
    RCLCPP_WARN(logger(), "write '%s' failed: %s", command.c_str(),
                serial_.last_error().c_str());
    return false;
  }

  // 配置指令的应答形如 "$mtype:2#OK"。只要在窗口期内看到 "OK" 即认可。
  std::string reply;
  const auto deadline = std::chrono::steady_clock::now() + kConfigReplyTimeout;
  while (std::chrono::steady_clock::now() < deadline) {
    reply += serial_.read_available(std::chrono::milliseconds(20));
    if (reply.find("OK") != std::string::npos) {
      return true;
    }
  }
  return false;
}

hardware_interface::CallbackReturn MecanumSystemHardware::on_activate(
    const rclcpp_lifecycle::State & /*previous_state*/) {
  // 丢掉激活前堆积的旧上报，从干净状态开始。
  serial_.flush_buffers();
  assembler_.clear();
  has_total_reference_ = false;
  consecutive_read_misses_ = 0;
  velocity_rad_s_.fill(0.0);
  command_rad_s_.fill(0.0);

  // 打开累计计数 + 10ms 增量两路上报（协议总结 §3.3、确认结论 Q3/Q4）。
  const std::string upload_on =
      protocol::make_upload_command(/*total=*/true, /*delta=*/true,
                                    /*speed=*/false);
  if (!serial_.write_all(upload_on,
                         std::chrono::milliseconds(write_timeout_ms_))) {
    RCLCPP_ERROR(logger(), "failed to enable encoder upload: %s",
                 serial_.last_error().c_str());
    return hardware_interface::CallbackReturn::ERROR;
  }

  RCLCPP_INFO(logger(), "activated, encoder upload enabled");
  return hardware_interface::CallbackReturn::SUCCESS;
}

hardware_interface::CallbackReturn MecanumSystemHardware::on_deactivate(
    const rclcpp_lifecycle::State & /*previous_state*/) {
  send_stop_command();

  // 关闭上报，让串口安静下来。失败不阻止去激活。
  const std::string upload_off =
      protocol::make_upload_command(false, false, false);
  if (!serial_.write_all(upload_off,
                         std::chrono::milliseconds(write_timeout_ms_))) {
    RCLCPP_WARN(logger(), "failed to disable encoder upload: %s",
                serial_.last_error().c_str());
  }

  RCLCPP_INFO(logger(), "deactivated, motors stopped");
  return hardware_interface::CallbackReturn::SUCCESS;
}

hardware_interface::CallbackReturn MecanumSystemHardware::on_cleanup(
    const rclcpp_lifecycle::State & /*previous_state*/) {
  if (serial_.is_open()) {
    send_stop_command();
    serial_.close();
  }
  return hardware_interface::CallbackReturn::SUCCESS;
}

hardware_interface::CallbackReturn MecanumSystemHardware::on_shutdown(
    const rclcpp_lifecycle::State & /*previous_state*/) {
  if (serial_.is_open()) {
    send_stop_command();
    serial_.close();
  }
  return hardware_interface::CallbackReturn::SUCCESS;
}

void MecanumSystemHardware::send_stop_command() {
  const std::array<int, protocol::kMotorCount> zeros = {0, 0, 0, 0};
  // 停车指令多给一点时间（2 倍写超时），提高送达概率。
  if (!serial_.write_all(protocol::make_speed_command(zeros),
                         std::chrono::milliseconds(write_timeout_ms_ * 2))) {
    RCLCPP_WARN(logger(), "failed to send stop command: %s",
                serial_.last_error().c_str());
  }
}

hardware_interface::return_type
MecanumSystemHardware::read(const rclcpp::Time & /*time*/,
                            const rclcpp::Duration & /*period*/) {
  // 1) 收字节。超时内无数据返回空串，是正常情况。
  const std::string bytes =
      serial_.read_available(std::chrono::milliseconds(read_timeout_ms_));
  if (bytes.empty() && !serial_.last_error().empty()) {
    // 空数据 + 有错误 = 真故障（如 USB 拔线），立即报错。
    RCLCPP_ERROR(logger(), "serial read error: %s",
                 serial_.last_error().c_str());
    return hardware_interface::return_type::ERROR;
  }
  assembler_.append(bytes);

  // 2) 切帧并解析。一个周期可能积累多帧，全部处理、以最新为准。
  bool got_total = false;
  bool got_delta = false;
  protocol::QuadCounts latest_total = {};
  protocol::QuadCounts latest_delta = {};
  for (const std::string &frame : assembler_.take_frames()) {
    if (const auto counts = protocol::parse_counts(frame, "MAll")) {
      latest_total = *counts;
      got_total = true;
    } else if (const auto delta = protocol::parse_counts(frame, "MTEP")) {
      latest_delta = *delta;
      got_delta = true;
    } else {
      // 既不是 MAll 也不是 MTEP：可能是坏帧，也可能是配置应答残留。
      // 记 DEBUG 日志后忽略，不影响本周期其余帧。
      RCLCPP_DEBUG(logger(), "ignoring unparsable frame: '%s'", frame.c_str());
    }
  }

  // 3) 换算成 SI 单位写入状态接口。
  if (got_total) {
    if (!has_total_reference_) {
      // 第一帧作为位置零点：激活时刻位置 = 0 rad。
      total_reference_ = latest_total;
      has_total_reference_ = true;
    }
    last_total_counts_ = latest_total;
    for (int m = 0; m < protocol::kMotorCount; ++m) {
      const double revs =
          static_cast<double>(latest_total[m] - total_reference_[m]) /
          counts_per_rev_;
      position_rad_[m] = direction_[m] * revs * kTwoPi;
    }
  }
  if (got_delta) {
    for (int m = 0; m < protocol::kMotorCount; ++m) {
      const double revs_per_sec = static_cast<double>(latest_delta[m]) /
                                  counts_per_rev_ / kDeltaPeriodSec;
      velocity_rad_s_[m] = direction_[m] * revs_per_sec * kTwoPi;
    }
  }

  // 4) 超时判定：连续多个周期一帧都解析不出来才算通信故障。
  //    单个周期收不到帧是正常的（控制周期可能比上报周期短）。
  if (got_total || got_delta) {
    consecutive_read_misses_ = 0;
  } else {
    ++consecutive_read_misses_;
    if (consecutive_read_misses_ >= max_read_misses_) {
      RCLCPP_ERROR(logger(),
                   "no valid encoder frame in %d consecutive cycles, "
                   "communication considered lost",
                   consecutive_read_misses_);
      return hardware_interface::return_type::ERROR;
    }
  }
  return hardware_interface::return_type::OK;
}

hardware_interface::return_type
MecanumSystemHardware::write(const rclcpp::Time & /*time*/,
                             const rclcpp::Duration & /*period*/) {
  // rad/s → mm/s：v = ω × r × 1000（协议总结 §5.3），再乘方向系数。
  std::array<int, protocol::kMotorCount> speed_mm_s = {};
  for (int m = 0; m < protocol::kMotorCount; ++m) {
    const double command = command_rad_s_[m];
    // NaN 防御：控制器异常时可能写入 NaN，直接当 0 处理。
    const double safe_command = std::isfinite(command) ? command : 0.0;
    speed_mm_s[m] = static_cast<int>(
        std::lround(direction_[m] * safe_command * wheel_radius_m_ * 1000.0));
  }

  if (!serial_.write_all(protocol::make_speed_command(speed_mm_s),
                         std::chrono::milliseconds(write_timeout_ms_))) {
    RCLCPP_ERROR(logger(), "serial write error: %s",
                 serial_.last_error().c_str());
    return hardware_interface::return_type::ERROR;
  }
  return hardware_interface::return_type::OK;
}

} // namespace motor_driver

#include "pluginlib/class_list_macros.hpp"
PLUGINLIB_EXPORT_CLASS(motor_driver::MecanumSystemHardware,
                       hardware_interface::SystemInterface)
