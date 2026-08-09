/**
 * @file jpeg_frame_validator.h
 * @author ChangBin bin_chang@qq.com
 * @date 2026-08-10
 * @brief 从 V4L2 原始缓冲中定位完整 JPEG 帧。
 */

#ifndef HIK_CAMERA_BRINGUP_INCLUDE_HIK_CAMERA_BRINGUP_JPEG_FRAME_VALIDATOR_H_
#define HIK_CAMERA_BRINGUP_INCLUDE_HIK_CAMERA_BRINGUP_JPEG_FRAME_VALIDATOR_H_

#include <cstdint>
#include <optional>
#include <span>
#include <vector>

namespace hik_camera_bringup {

/**
 * @brief 定位第一个由 JPEG 起止标记完整包围的帧。
 *
 * @param buffer usb_cam 的原始 MJPEG 缓冲。
 * @return 完整 JPEG 的只读视图；找不到完整边界时返回空值。
 */
std::optional<std::span<const uint8_t>> FindJpegFrame(
    const std::vector<uint8_t>& buffer);

}  // namespace hik_camera_bringup

#endif  // HIK_CAMERA_BRINGUP_INCLUDE_HIK_CAMERA_BRINGUP_JPEG_FRAME_VALIDATOR_H_
