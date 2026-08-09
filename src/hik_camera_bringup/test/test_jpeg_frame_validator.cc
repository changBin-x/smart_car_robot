/**
 * @file test_jpeg_frame_validator.cc
 * @author ChangBin bin_chang@qq.com
 * @date 2026-08-10
 * @brief 验证原始 V4L2 缓冲中的 JPEG 边界提取规则。
 */

#include <cstdint>
#include <vector>

#include "gtest/gtest.h"
#include "hik_camera_bringup/jpeg_frame_validator.h"

namespace hik_camera_bringup {
namespace {

TEST(JpegFrameValidatorTest, ExtractsJpegBetweenMarkers) {
  const std::vector<uint8_t> buffer{
      0x00, 0x11, 0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9, 0x99};

  const std::optional<std::span<const uint8_t>> frame = FindJpegFrame(buffer);

  ASSERT_TRUE(frame.has_value());
  EXPECT_EQ(frame->size(), 6U);
  EXPECT_EQ((*frame)[0], 0xff);
  EXPECT_EQ((*frame)[1], 0xd8);
  EXPECT_EQ((*frame)[4], 0xff);
  EXPECT_EQ((*frame)[5], 0xd9);
}

TEST(JpegFrameValidatorTest, RejectsBufferWithoutStartMarker) {
  const std::vector<uint8_t> buffer{0x00, 0xff, 0xd9, 0x01};

  EXPECT_FALSE(FindJpegFrame(buffer).has_value());
}

TEST(JpegFrameValidatorTest, RejectsIncompleteJpegFrame) {
  const std::vector<uint8_t> buffer{0xff, 0xd8, 0x01, 0x02};

  EXPECT_FALSE(FindJpegFrame(buffer).has_value());
}

}  // namespace
}  // namespace hik_camera_bringup
