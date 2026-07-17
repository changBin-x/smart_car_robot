// Copyright 2026 smart_car_robot
//
// 协议层（protocol layer）：
// 负责把"要发给驱动板的内容"编码成 ASCII 指令字符串，
// 以及把驱动板上报的 ASCII 帧解析成数值。
// 本层不接触串口、不依赖 ROS，因此可以脱离硬件做单元测试
// （见 test/test_protocol.cpp）。
//
// 协议格式速查（完整说明见 src/docs/协议总结.md）：
//   下发指令：  $spd:100,-100,0,50#      控制 4 个电机速度，单位 mm/s
//   上报帧：    $MAll:m1,m2,m3,m4#       累计编码器计数（用于算位置）
//               $MTEP:m1,m2,m3,m4#       每 10 ms 编码器增量（用于算速度）
// 每帧以 '$' 开始、'#' 结束，字段用 ',' 分隔；协议没有 CRC，
// 只能靠定界符和字段格式判断一帧是否完整、合法。

#ifndef MOTOR_DRIVER_PROTOCOL_HPP_
#define MOTOR_DRIVER_PROTOCOL_HPP_

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace motor_driver {
namespace protocol {

// 驱动板固定为 4 路电机（板载丝印 M1~M4）。
inline constexpr int kMotorCount = 4;

// $spd 指令允许的速度范围（mm/s）。超出范围驱动板会忽略整条指令，
// 所以编码时必须先钳位。
inline constexpr int kMaxSpeedMmPerS = 1000;

// 帧定界符。
inline constexpr char kFrameStart = '$';
inline constexpr char kFrameEnd = '#';

// 4 个电机的一组计数值，下标 0~3 对应 M1~M4。
using QuadCounts = std::array<int64_t, kMotorCount>;

// ---------------- 指令编码（上位机 → 驱动板） ----------------

// 生成速度控制指令 "$spd:m1,m2,m3,m4#"。输入单位 mm/s，
// 内部自动钳位到 ±kMaxSpeedMmPerS。
std::string make_speed_command(const std::array<int, kMotorCount>& mm_per_s);

// 生成数据上报开关指令 "$upload:a,b,c#"。
// total = 累计编码器计数（$MAll），delta = 10ms 增量（$MTEP），
// speed = 板内换算好的速度（$MSPD，本项目不用）。
std::string make_upload_command(bool total, bool delta, bool speed);

// 以下为板内参数配置指令（断电保存，on_configure 时下发做"自愈"）。
std::string make_motor_type_command(int motor_type);        // $mtype:x#
std::string make_encoder_lines_command(int lines);          // $mline:xx#
std::string make_gear_ratio_command(int ratio);             // $mphase:xx#
std::string make_wheel_diameter_command(double diameter_mm);  // $wdiameter:x#
std::string make_deadzone_command(int deadzone);            // $deadzone:x#

// ---------------- 帧解析（驱动板 → 上位机） ----------------

// 把串口收到的字节流拼接起来，按 '$'...'#' 定界切出完整帧。
// 串口一次 read() 到的字节不一定恰好是一帧（可能半帧、可能几帧连着），
// 所以需要这个"攒一攒再切"的缓冲器。
class FrameAssembler {
 public:
  // 追加新收到的字节。缓冲超过上限时丢弃最旧的数据，防止
  // 长时间收不到 '#'（例如波特率接错）导致内存无限增长。
  void append(const std::string& bytes);

  // 取出当前已完整的所有帧（含 '$' 和 '#'），并从缓冲中移除。
  // 帧前面的垃圾字节（如配置应答里的 "OK"）会被丢弃。
  std::vector<std::string> take_frames();

  // 清空缓冲。激活硬件前调用，丢掉激活前堆积的旧数据。
  void clear();

 private:
  // 正常一帧不到 64 字节，4096 足够容纳几十帧的积压。
  static constexpr size_t kMaxBufferBytes = 4096;

  std::string buffer_;
};

// 解析形如 "$<keyword>:v1,v2,v3,v4#" 的上报帧。
// keyword 传 "MAll" 或 "MTEP"。帧头不匹配、字段数不是 4、
// 出现非整数字符等任何异常都返回 std::nullopt（视为校验失败）。
std::optional<QuadCounts> parse_counts(const std::string& frame,
                                       const std::string& keyword);

}  // namespace protocol
}  // namespace motor_driver

#endif  // MOTOR_DRIVER_PROTOCOL_HPP_
