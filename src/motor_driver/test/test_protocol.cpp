// Copyright 2026 smart_car_robot
//
// 协议层单元测试。协议层是纯逻辑（不碰串口、不依赖 ROS），
// 因此可以在 WSL2 无硬件环境下完整验证：
//   - 指令编码格式是否与 docs/协议总结.md 一致
//   - 速度是否正确钳位到 ±1000 mm/s
//   - 帧拆分能否处理半帧、粘连、垃圾字节
//   - 帧解析对坏帧是否严格拒绝（返回 nullopt）

#include "motor_driver/protocol.hpp"

#include <gtest/gtest.h>

#include <array>
#include <string>

namespace motor_driver {
namespace protocol {
namespace {

// ---------------- 指令编码 ----------------

TEST(MakeSpeedCommand, FormatsFourValues) {
  const std::array<int, kMotorCount> mm = {100, -100, 0, 50};
  EXPECT_EQ(make_speed_command(mm), "$spd:100,-100,0,50#");
}

TEST(MakeSpeedCommand, ClampsToRange) {
  const std::array<int, kMotorCount> mm = {5000, -5000, 1000, -1000};
  // 超过 ±1000 的值必须被钳到边界，否则驱动板会整条丢弃。
  EXPECT_EQ(make_speed_command(mm), "$spd:1000,-1000,1000,-1000#");
}

TEST(MakeSpeedCommand, ZeroIsStopFrame) {
  const std::array<int, kMotorCount> zeros = {0, 0, 0, 0};
  EXPECT_EQ(make_speed_command(zeros), "$spd:0,0,0,0#");
}

TEST(MakeUploadCommand, EncodesSwitches) {
  EXPECT_EQ(make_upload_command(true, true, false), "$upload:1,1,0#");
  EXPECT_EQ(make_upload_command(false, false, false), "$upload:0,0,0#");
  EXPECT_EQ(make_upload_command(true, false, true), "$upload:1,0,1#");
}

TEST(MakeConfigCommands, MatchProtocolDoc) {
  EXPECT_EQ(make_motor_type_command(2), "$mtype:2#");
  EXPECT_EQ(make_encoder_lines_command(13), "$mline:13#");
  EXPECT_EQ(make_gear_ratio_command(20), "$mphase:20#");
  EXPECT_EQ(make_deadzone_command(1300), "$deadzone:1300#");
}

TEST(MakeWheelDiameterCommand, TwoDecimalPlaces) {
  // 60mm 直径应格式化为 "60.00"，与官方例程格式一致。
  EXPECT_EQ(make_wheel_diameter_command(60.0), "$wdiameter:60.00#");
  EXPECT_EQ(make_wheel_diameter_command(48.0), "$wdiameter:48.00#");
}

// ---------------- 帧拆分 ----------------

TEST(FrameAssembler, SplitsSingleFrame) {
  FrameAssembler assembler;
  assembler.append("$MAll:1,2,3,4#");
  const auto frames = assembler.take_frames();
  ASSERT_EQ(frames.size(), 1u);
  EXPECT_EQ(frames[0], "$MAll:1,2,3,4#");
}

TEST(FrameAssembler, SplitsBackToBackFrames) {
  FrameAssembler assembler;
  assembler.append("$MAll:1,2,3,4#$MTEP:5,6,7,8#");
  const auto frames = assembler.take_frames();
  ASSERT_EQ(frames.size(), 2u);
  EXPECT_EQ(frames[0], "$MAll:1,2,3,4#");
  EXPECT_EQ(frames[1], "$MTEP:5,6,7,8#");
}

TEST(FrameAssembler, HoldsPartialFrameUntilComplete) {
  FrameAssembler assembler;
  // 第一批只到半帧，不应产出任何完整帧。
  assembler.append("$MAll:1,2");
  EXPECT_TRUE(assembler.take_frames().empty());
  // 补上后半帧，这时才切出完整帧。
  assembler.append(",3,4#");
  const auto frames = assembler.take_frames();
  ASSERT_EQ(frames.size(), 1u);
  EXPECT_EQ(frames[0], "$MAll:1,2,3,4#");
}

TEST(FrameAssembler, DropsLeadingGarbage) {
  FrameAssembler assembler;
  // 帧头之前的垃圾字节（如配置应答 "OK" 残留）应被丢弃。
  assembler.append("OK$MTEP:1,2,3,4#");
  const auto frames = assembler.take_frames();
  ASSERT_EQ(frames.size(), 1u);
  EXPECT_EQ(frames[0], "$MTEP:1,2,3,4#");
}

// ---------------- 帧解析 ----------------

TEST(ParseCounts, ParsesValidFrame) {
  const auto counts = parse_counts("$MAll:10,-20,30,-40#", "MAll");
  ASSERT_TRUE(counts.has_value());
  EXPECT_EQ((*counts)[0], 10);
  EXPECT_EQ((*counts)[1], -20);
  EXPECT_EQ((*counts)[2], 30);
  EXPECT_EQ((*counts)[3], -40);
}

TEST(ParseCounts, RejectsWrongKeyword) {
  // 用 MAll 关键字去解析 MTEP 帧，必须失败。
  EXPECT_FALSE(parse_counts("$MTEP:1,2,3,4#", "MAll").has_value());
}

TEST(ParseCounts, RejectsMissingTerminator) {
  EXPECT_FALSE(parse_counts("$MAll:1,2,3,4", "MAll").has_value());
}

TEST(ParseCounts, RejectsTooFewFields) {
  EXPECT_FALSE(parse_counts("$MAll:1,2,3#", "MAll").has_value());
}

TEST(ParseCounts, RejectsTooManyFields) {
  EXPECT_FALSE(parse_counts("$MAll:1,2,3,4,5#", "MAll").has_value());
}

TEST(ParseCounts, RejectsNonInteger) {
  // "12ab" 这类含非法字符的字段必须整体拒绝，不能只取前面的 12。
  EXPECT_FALSE(parse_counts("$MAll:12ab,2,3,4#", "MAll").has_value());
}

TEST(ParseCounts, RejectsEmptyField) {
  EXPECT_FALSE(parse_counts("$MAll:,2,3,4#", "MAll").has_value());
}

}  // namespace
}  // namespace protocol
}  // namespace motor_driver

int main(int argc, char** argv) {
  ::testing::InitGoogleTest(&argc, argv);
  return RUN_ALL_TESTS();
}
