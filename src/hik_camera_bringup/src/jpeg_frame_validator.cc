/**
 * @file jpeg_frame_validator.cc
 * @author ChangBin bin_chang@qq.com
 * @date 2026-08-10
 * @brief 实现原始 V4L2 缓冲中的 JPEG 帧边界校验。
 */

#include "hik_camera_bringup/jpeg_frame_validator.h"

#include <cstddef>

namespace hik_camera_bringup {
namespace {

constexpr uint8_t kJpegMarkerPrefix = 0xff;
constexpr uint8_t kJpegStartMarker = 0xd8;
constexpr uint8_t kJpegEndMarker = 0xd9;

}  // namespace

std::optional<std::span<const uint8_t>> FindJpegFrame(
    const std::vector<uint8_t>& buffer) {
  std::optional<std::size_t> start_index;

  for (std::size_t index = 0; index + 1 < buffer.size(); ++index) {
    const bool is_marker_prefix = buffer[index] == kJpegMarkerPrefix;
    if (!is_marker_prefix) {
      continue;
    }

    if (!start_index.has_value() && buffer[index + 1] == kJpegStartMarker) {
      start_index = index;
      ++index;
      continue;
    }

    if (start_index.has_value() && buffer[index + 1] == kJpegEndMarker) {
      const std::size_t frame_size = index + 2 - *start_index;
      return std::span<const uint8_t>(buffer.data() + *start_index, frame_size);
    }
  }

  return std::nullopt;
}

}  // namespace hik_camera_bringup
