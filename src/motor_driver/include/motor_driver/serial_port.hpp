/**
 * Author: ChangBin bin_chang@qq.com
 * Date: 2026-07-17
 * LastEditors: ChangBin bin_chang@qq.com
 * LastEditTime: 2026-07-17
 * Copyright (c) 2026 by ChangBin, All Rights Reserved.
 * Description: 串口传输层（transport layer）
 */
// 用 Linux termios 接口封装一个"打开-读-写-关闭"的最小串口类。
// 本层只搬运字节，不理解协议内容（协议在 protocol.hpp）。
//
// 设计要点（为什么这样写）：
// 1. 读写都带毫秒级超时，绝不无限阻塞——ros2_control 的控制循环
//    以固定周期调用 read()/write()，任何一次卡死都会拖垮整个循环。
// 2. 所有方法失败时返回 false/空串而不抛异常，由上层决定如何上报。
// 3. RAII：析构自动关闭文件描述符，防止泄漏。

#ifndef MOTOR_DRIVER_SERIAL_PORT_HPP_
#define MOTOR_DRIVER_SERIAL_PORT_HPP_

#include <chrono>
#include <string>

namespace motor_driver {

class SerialPort {
public:
  SerialPort() = default;

  // 禁止拷贝：一个对象独占一个文件描述符。
  SerialPort(const SerialPort &) = delete;
  SerialPort &operator=(const SerialPort &) = delete;

  ~SerialPort();

  // 打开并配置串口。8 数据位、无校验、1 停止位、无流控（8N1）。
  // device 例如 "/dev/ttyUSB0"；baud_rate 仅支持常用值（见实现）。
  // 失败返回 false，可通过 last_error() 取得原因。
  bool open(const std::string &device, int baud_rate);

  // 关闭串口。未打开时调用无副作用。
  void close();

  bool is_open() const { return fd_ >= 0; }

  // 把 data 全部写出。在 timeout 内没写完（或出错）返回 false。
  bool write_all(const std::string &data, std::chrono::milliseconds timeout);

  // 读取当前可读的字节，最多等待 timeout。
  // 返回读到的内容；超时无数据返回空串（不算错误——上报帧是
  // 周期性的，两帧之间本来就可能没数据）。出错也返回空串，
  // 用 last_error() 区分。
  std::string read_available(std::chrono::milliseconds timeout);

  // 丢弃内核收发缓冲里已堆积的数据（激活前清掉陈旧上报）。
  void flush_buffers();

  // 最近一次失败的人类可读描述（含 errno 文本），成功操作会清空它。
  const std::string &last_error() const { return last_error_; }

private:
  int fd_ = -1;
  std::string last_error_;
};

} // namespace motor_driver

#endif // MOTOR_DRIVER_SERIAL_PORT_HPP_
