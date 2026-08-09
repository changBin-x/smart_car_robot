/**
 * @file hik_mjpeg_decoder_node.cc
 * @author ChangBin bin_chang@qq.com
 * @date 2026-08-10
 * @brief 校验 usb_cam 原始 MJPEG 缓冲并发布标准 BGR 图像。
 */

#include <cstdint>
#include <exception>
#include <functional>
#include <limits>
#include <memory>
#include <mutex>
#include <optional>
#include <span>
#include <stdexcept>
#include <utility>

#include "cv_bridge/cv_bridge.hpp"
#include "opencv2/imgcodecs.hpp"
#include "rclcpp/rclcpp.hpp"
#include "sensor_msgs/image_encodings.hpp"
#include "sensor_msgs/msg/camera_info.hpp"
#include "sensor_msgs/msg/image.hpp"
#include "std_msgs/msg/header.hpp"

#include "hik_camera_bringup/jpeg_frame_validator.h"

namespace hik_camera_bringup {
namespace {

constexpr int64_t kWarningThrottleMs = 5000;

}  // namespace

class HikMjpegDecoderNode final : public rclcpp::Node {
 public:
  HikMjpegDecoderNode()
      : Node("hik_mjpeg_decoder_node"),
        expected_image_width_(declare_parameter<int>(
            "expected_image_width", 1920)),
        expected_image_height_(declare_parameter<int>(
            "expected_image_height", 1080)),
        image_publisher_(create_publisher<sensor_msgs::msg::Image>(
            "image_raw", rclcpp::SensorDataQoS().keep_last(1))),
        camera_info_publisher_(
            create_publisher<sensor_msgs::msg::CameraInfo>(
                "camera_info", rclcpp::SensorDataQoS().keep_last(1))) {
    if (expected_image_width_ <= 0 || expected_image_height_ <= 0) {
      throw std::invalid_argument(
          "expected_image_width 和 expected_image_height 必须为正数");
    }

    image_subscription_ = create_subscription<sensor_msgs::msg::Image>(
        "driver/image_raw", rclcpp::SensorDataQoS().keep_last(1),
        std::bind(&HikMjpegDecoderNode::OnRawMjpegImage, this,
                  std::placeholders::_1));
    camera_info_subscription_ =
        create_subscription<sensor_msgs::msg::CameraInfo>(
            "driver/camera_info", rclcpp::SensorDataQoS().keep_last(1),
            std::bind(&HikMjpegDecoderNode::OnCameraInfo, this,
                      std::placeholders::_1));
  }

 private:
  /** @brief 缓存采集驱动提供的最新相机内参。 */
  void OnCameraInfo(const sensor_msgs::msg::CameraInfo::SharedPtr camera_info) {
    std::lock_guard<std::mutex> lock(camera_info_mutex_);
    latest_camera_info_ = *camera_info;
  }

  /** @brief 校验、解码单帧 MJPEG 数据并发布标准 BGR 图像。 */
  void OnRawMjpegImage(const sensor_msgs::msg::Image::SharedPtr raw_image) {
    const std::optional<std::span<const uint8_t>> jpeg_frame =
        FindJpegFrame(raw_image->data);
    if (!jpeg_frame.has_value()) {
      RCLCPP_WARN_THROTTLE(
          get_logger(), *get_clock(), kWarningThrottleMs,
          "丢弃未包含完整 JPEG 起止标记的 MJPEG 缓冲");
      return;
    }

    if (jpeg_frame->size() >
        static_cast<std::size_t>(std::numeric_limits<int>::max())) {
      RCLCPP_WARN_THROTTLE(
          get_logger(), *get_clock(), kWarningThrottleMs,
          "丢弃长度超过 OpenCV 解码器上限的 JPEG 帧");
      return;
    }

    const cv::Mat encoded_frame(
        1, static_cast<int>(jpeg_frame->size()), CV_8UC1,
        const_cast<uint8_t*>(jpeg_frame->data()));
    const cv::Mat decoded_image =
        cv::imdecode(encoded_frame, cv::IMREAD_COLOR);
    if (decoded_image.empty()) {
      RCLCPP_WARN_THROTTLE(
          get_logger(), *get_clock(), kWarningThrottleMs,
          "丢弃 OpenCV 无法解码的 MJPEG 帧");
      return;
    }

    if (decoded_image.cols != expected_image_width_ ||
        decoded_image.rows != expected_image_height_) {
      RCLCPP_WARN_THROTTLE(
          get_logger(), *get_clock(), kWarningThrottleMs,
          "丢弃分辨率为 %dx%d 的帧，期望分辨率为 %dx%d",
          decoded_image.cols, decoded_image.rows, expected_image_width_,
          expected_image_height_);
      return;
    }

    const sensor_msgs::msg::Image::SharedPtr decoded_message =
        cv_bridge::CvImage(raw_image->header, sensor_msgs::image_encodings::BGR8,
                           decoded_image)
            .toImageMsg();
    image_publisher_->publish(*decoded_message);
    PublishCameraInfo(decoded_message->header);
  }

  /** @brief 以当前图像时间戳发布最近接收的 CameraInfo。 */
  void PublishCameraInfo(const std_msgs::msg::Header& image_header) {
    std::optional<sensor_msgs::msg::CameraInfo> camera_info;
    {
      std::lock_guard<std::mutex> lock(camera_info_mutex_);
      camera_info = latest_camera_info_;
    }

    if (!camera_info.has_value()) {
      return;
    }

    camera_info->header = image_header;
    camera_info_publisher_->publish(*camera_info);
  }

  const int expected_image_width_;
  const int expected_image_height_;
  rclcpp::Publisher<sensor_msgs::msg::Image>::SharedPtr image_publisher_;
  rclcpp::Publisher<sensor_msgs::msg::CameraInfo>::SharedPtr
      camera_info_publisher_;
  rclcpp::Subscription<sensor_msgs::msg::Image>::SharedPtr image_subscription_;
  rclcpp::Subscription<sensor_msgs::msg::CameraInfo>::SharedPtr
      camera_info_subscription_;
  std::mutex camera_info_mutex_;
  std::optional<sensor_msgs::msg::CameraInfo> latest_camera_info_;
};

}  // namespace hik_camera_bringup

int main(int argc, char* argv[]) {
  rclcpp::init(argc, argv);
  try {
    rclcpp::spin(
        std::make_shared<hik_camera_bringup::HikMjpegDecoderNode>());
  } catch (const std::exception& error) {
    RCLCPP_FATAL(rclcpp::get_logger("hik_mjpeg_decoder_node"),
                 "相机桥接节点启动失败：%s", error.what());
    rclcpp::shutdown();
    return 1;
  }
  rclcpp::shutdown();
  return 0;
}
