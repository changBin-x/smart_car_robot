// Copyright 2026 smart_car_robot
//
// 硬件接口层（hardware interface layer）：
// 实现 hardware_interface::SystemInterface，是 ros2_control 框架与
// 底层串口驱动之间的桥梁。分层关系：
//
//   controller_manager (ros2_control)
//        │  每个控制周期调用 read() / write()
//        ▼
//   MecanumSystemHardware（本文件）—— 单位换算、生命周期、容错
//        ▼
//   protocol.hpp —— ASCII 帧编码/解析（纯逻辑，可单元测试）
//        ▼
//   serial_port.hpp —— termios 串口读写（带超时，不阻塞）
//
// 生命周期（由 controller_manager 驱动，新手须知）：
//   on_init      → 读 URDF <param>，分配内存，不碰硬件
//   on_configure → 打开串口，下发电机参数配置
//   on_activate  → 打开数据上报、清零参考计数，进入可控状态
//   read/write   → 每周期：解析上报帧 → 状态接口；命令接口 → $spd
//   on_deactivate→ 发零速停车，关上报
//   on_cleanup / on_shutdown / 析构 → 停车并关串口
//
// 容错策略（对应任务书健壮性要求）：
//   - 串口打不开 → on_configure 返回 ERROR
//   - read/write 内部串口错误、坏帧 → 打日志，连续超阈值返回 ERROR
//   - 任何路径都不抛异常出去，不崩溃

#ifndef MOTOR_DRIVER_MECANUM_SYSTEM_HARDWARE_HPP_
#define MOTOR_DRIVER_MECANUM_SYSTEM_HARDWARE_HPP_

#include <array>
#include <chrono>
#include <cstdint>
#include <string>
#include <vector>

#include "hardware_interface/handle.hpp"
#include "hardware_interface/hardware_info.hpp"
#include "hardware_interface/system_interface.hpp"
#include "hardware_interface/types/hardware_component_interface_params.hpp"
#include "hardware_interface/types/hardware_interface_return_values.hpp"
#include "rclcpp/logger.hpp"
#include "rclcpp_lifecycle/state.hpp"

#include "motor_driver/protocol.hpp"
#include "motor_driver/serial_port.hpp"

namespace motor_driver {

class MecanumSystemHardware : public hardware_interface::SystemInterface {
 public:
  MecanumSystemHardware() = default;

  // 析构兜底：无论生命周期停在哪个状态，都尽力发零速并关串口。
  ~MecanumSystemHardware() override;

  // ---- 生命周期回调（见文件头注释的流程图） ----
  // Jazzy 新签名：on_init 接收 HardwareComponentInterfaceParams
  // （内含 hardware_info 与 executor 弱引用），取代已弃用的
  // on_init(const HardwareInfo&) 重载。
  hardware_interface::CallbackReturn on_init(
      const hardware_interface::HardwareComponentInterfaceParams& params)
      override;

  hardware_interface::CallbackReturn on_configure(
      const rclcpp_lifecycle::State& previous_state) override;

  hardware_interface::CallbackReturn on_activate(
      const rclcpp_lifecycle::State& previous_state) override;

  hardware_interface::CallbackReturn on_deactivate(
      const rclcpp_lifecycle::State& previous_state) override;

  hardware_interface::CallbackReturn on_cleanup(
      const rclcpp_lifecycle::State& previous_state) override;

  hardware_interface::CallbackReturn on_shutdown(
      const rclcpp_lifecycle::State& previous_state) override;

  // ---- 接口导出：4 关节 × (position + velocity) 状态，velocity 命令 ----
  std::vector<hardware_interface::StateInterface> export_state_interfaces()
      override;

  std::vector<hardware_interface::CommandInterface> export_command_interfaces()
      override;

  // ---- 控制循环 ----
  hardware_interface::return_type read(
      const rclcpp::Time& time, const rclcpp::Duration& period) override;

  hardware_interface::return_type write(
      const rclcpp::Time& time, const rclcpp::Duration& period) override;

 private:
  // 从 URDF <ros2_control><hardware><param> 里读参数，
  // 缺失时用默认值。数字解析失败返回 false。
  bool load_parameters(const hardware_interface::HardwareInfo& info);

  // 校验 URDF 中的关节命名/接口配置是否与本驱动的约定一致。
  bool validate_joints(const hardware_interface::HardwareInfo& info) const;

  // 发送一条配置指令并等待 "OK" 应答（配置类指令有应答）。
  bool send_config_command(const std::string& command);

  // 向驱动板发零速指令（$spd:0,0,0,0#），停车用。
  // 失败只打日志不报错——停车是尽力而为的兜底动作。
  void send_stop_command();

  rclcpp::Logger logger() const;

  // ---- 串口与协议 ----
  SerialPort serial_;
  protocol::FrameAssembler assembler_;

  // ---- URDF <param> 参数（全部可配，不硬编码） ----
  std::string serial_port_name_ = "/dev/ttyUSB0";
  int baud_rate_ = 115200;
  int motor_type_ = 2;          // 2 = 310 电机（协议总结 §3.1）
  int encoder_lines_ = 13;      // 编码器基础线数 L
  int gear_ratio_ = 20;         // 减速比 G（已确认定为 20）
  int count_multiplier_ = 1;    // 计数倍频 K（1/2/4，实机标定）
  int deadzone_ = 1300;         // PWM 死区（310 电机例程值）
  double wheel_radius_m_ = 0.03;  // 轮半径 r（默认 60mm 直径）
  int read_timeout_ms_ = 15;    // 单次 read() 串口等待上限（≤20ms）
  int write_timeout_ms_ = 15;   // 单次 write() 串口等待上限
  int max_read_misses_ = 20;    // 连续无有效帧的容忍周期数
  // 每轮方向系数（+1/-1），处理左右侧电机镜像安装。顺序 M1~M4。
  std::array<double, protocol::kMotorCount> direction_ = {1.0, 1.0, 1.0, 1.0};

  // 输出轴每转编码器计数 CPR = L × G × K，on_init 时算好。
  double counts_per_rev_ = 260.0;

  // ---- 关节顺序 ----
  // 状态/命令数组固定按"驱动板电机编号"排序：
  //   下标 0=M1 左前, 1=M2 左后, 2=M3 右前, 3=M4 右后
  // joint_index_[i] 记录第 i 个电机对应 info_.joints 里的哪个关节，
  // 这样 URDF 里关节写成什么顺序都能对上。
  std::array<size_t, protocol::kMotorCount> joint_index_ = {0, 1, 2, 3};

  // ---- 状态/命令存储（导出给 ros2_control 的内存） ----
  std::array<double, protocol::kMotorCount> position_rad_ = {};
  std::array<double, protocol::kMotorCount> velocity_rad_s_ = {};
  std::array<double, protocol::kMotorCount> command_rad_s_ = {};

  // ---- read() 的运行时状态 ----
  // 最近一次收到的累计计数（算位置），及"是否已收到过第一帧"。
  protocol::QuadCounts last_total_counts_ = {};
  bool has_total_reference_ = false;
  // 激活时刻的计数基准：位置从激活时刻起算，从 0 开始增长。
  protocol::QuadCounts total_reference_ = {};
  // 连续未解析到有效帧的 read() 次数，超过 max_read_misses_ 报 ERROR。
  int consecutive_read_misses_ = 0;
};

}  // namespace motor_driver

#endif  // MOTOR_DRIVER_MECANUM_SYSTEM_HARDWARE_HPP_
