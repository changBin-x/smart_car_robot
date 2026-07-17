/**
 * Author: ChangBin bin_chang@qq.com
 * Date: 2026-07-17
 * LastEditors: ChangBin bin_chang@qq.com
 * LastEditTime: 2026-07-17
 * Copyright (c) 2026 by ChangBin, All Rights Reserved.
 * Description: 协议层实现，与 protocol.hpp 配对阅读
 */

#include "motor_driver/protocol.hpp"

#include <algorithm>
#include <cerrno>
#include <cstdio>
#include <cstdlib>

namespace motor_driver {
namespace protocol {

namespace {

// 把 int 数组拼成 "v1,v2,v3,v4" 形式。
std::string join_values(const std::array<int, kMotorCount> &values) {
  std::string result;
  for (int i = 0; i < kMotorCount; ++i) {
    if (i > 0) {
      result += ',';
    }
    result += std::to_string(values[i]);
  }
  return result;
}

// 严格地把字符串转成 int64。整串必须是一个合法整数
// （允许前导正负号），否则返回 nullopt。
// 不用 std::stoll 是因为它遇到 "12ab" 会解析成 12 而不报错，
// 而我们要求"任何异常字符都视为坏帧"。
std::optional<int64_t> parse_strict_int(const std::string &text) {
  if (text.empty()) {
    return std::nullopt;
  }
  errno = 0;
  char *end = nullptr;
  const int64_t value = std::strtoll(text.c_str(), &end, 10);
  if (errno != 0 || end != text.c_str() + text.size()) {
    return std::nullopt;
  }
  return value;
}

} // namespace

std::string make_speed_command(const std::array<int, kMotorCount> &mm_per_s) {
  std::array<int, kMotorCount> clamped{};
  for (int i = 0; i < kMotorCount; ++i) {
    clamped[i] = std::clamp(mm_per_s[i], -kMaxSpeedMmPerS, kMaxSpeedMmPerS);
  }
  return "$spd:" + join_values(clamped) + "#";
}

std::string make_upload_command(bool total, bool delta, bool speed) {
  std::string result = "$upload:";
  result += total ? '1' : '0';
  result += ',';
  result += delta ? '1' : '0';
  result += ',';
  result += speed ? '1' : '0';
  result += '#';
  return result;
}

std::string make_motor_type_command(int motor_type) {
  return "$mtype:" + std::to_string(motor_type) + "#";
}

std::string make_encoder_lines_command(int lines) {
  return "$mline:" + std::to_string(lines) + "#";
}

std::string make_gear_ratio_command(int ratio) {
  return "$mphase:" + std::to_string(ratio) + "#";
}

std::string make_wheel_diameter_command(double diameter_mm) {
  // 固定两位小数，与官方例程 "$wdiameter:67.00#" 的格式一致。
  char buffer[32] = {};
  std::snprintf(buffer, sizeof(buffer), "$wdiameter:%.2f#", diameter_mm);
  return std::string(buffer);
}

std::string make_deadzone_command(int deadzone) {
  return "$deadzone:" + std::to_string(deadzone) + "#";
}

void FrameAssembler::append(const std::string &bytes) {
  buffer_ += bytes;
  // 缓冲过长说明一直没有收到帧尾，只保留最近的数据。
  if (buffer_.size() > kMaxBufferBytes) {
    buffer_.erase(0, buffer_.size() - kMaxBufferBytes);
  }
}

std::vector<std::string> FrameAssembler::take_frames() {
  std::vector<std::string> frames;
  while (true) {
    // 帧从最近一个 '$' 开始；'$' 之前的字节都是垃圾，丢弃。
    const size_t start = buffer_.find(kFrameStart);
    if (start == std::string::npos) {
      buffer_.clear();
      break;
    }
    const size_t end = buffer_.find(kFrameEnd, start + 1);
    if (end == std::string::npos) {
      // 帧尾还没到，把已知的帧头留在缓冲里等下一批字节。
      buffer_.erase(0, start);
      break;
    }
    frames.push_back(buffer_.substr(start, end - start + 1));
    buffer_.erase(0, end + 1);
  }
  return frames;
}

void FrameAssembler::clear() { buffer_.clear(); }

std::optional<QuadCounts> parse_counts(const std::string &frame,
                                       const std::string &keyword) {
  // 期望格式："$" + keyword + ":" + 4 个逗号分隔整数 + "#"
  const std::string prefix = std::string(1, kFrameStart) + keyword + ":";
  if (frame.size() < prefix.size() + 1 || frame.back() != kFrameEnd ||
      frame.compare(0, prefix.size(), prefix) != 0) {
    return std::nullopt;
  }

  // 掐头去尾，得到 "v1,v2,v3,v4"。
  const std::string payload =
      frame.substr(prefix.size(), frame.size() - prefix.size() - 1);

  QuadCounts counts{};
  size_t field_begin = 0;
  for (int i = 0; i < kMotorCount; ++i) {
    const bool is_last_field = (i == kMotorCount - 1);
    const size_t comma = payload.find(',', field_begin);
    if (is_last_field != (comma == std::string::npos)) {
      // 逗号数量与字段数不匹配（少于或多于 4 个字段）。
      return std::nullopt;
    }
    const size_t field_end = is_last_field ? payload.size() : comma;
    const auto value =
        parse_strict_int(payload.substr(field_begin, field_end - field_begin));
    if (!value.has_value()) {
      return std::nullopt;
    }
    counts[i] = *value;
    field_begin = field_end + 1;
  }
  return counts;
}

} // namespace protocol
} // namespace motor_driver
