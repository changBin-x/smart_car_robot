// Author: ChangBin bin_chang@qq.com
// Date: 2026-07-17
// LastEditors: ChangBin bin_chang@qq.com
// LastEditTime: 2026-07-17
// Copyright (c) 2026 by ChangBin, All Rights Reserved.
// Description: 串口传输层实现，与 serial_port.hpp 配对阅读
//
// 术语速记（新手向）：
// - 文件描述符 fd：Linux 里"打开的设备/文件"的整数句柄，-1 表示无效。
// - termios：Linux 配置串口（波特率、数据位等）的标准 C 接口。
// - poll()：等待"fd 可读/可写"的系统调用，带超时，是避免
//   read()/write() 无限阻塞的关键。

#include "motor_driver/serial_port.hpp"

#include <fcntl.h>
#include <poll.h>
#include <termios.h>
#include <unistd.h>

#include <cerrno>
#include <cstring>

namespace motor_driver {

namespace {

// 把常用波特率数值转成 termios 的速率常量。
// 返回 0 表示不支持该波特率。
speed_t to_termios_baud(int baud_rate) {
  switch (baud_rate) {
    case 9600:
      return B9600;
    case 19200:
      return B19200;
    case 38400:
      return B38400;
    case 57600:
      return B57600;
    case 115200:
      return B115200;
    case 230400:
      return B230400;
    default:
      return 0;
  }
}

std::string errno_text() { return std::strerror(errno); }

}  // namespace

SerialPort::~SerialPort() { close(); }

bool SerialPort::open(const std::string& device, int baud_rate) {
  close();

  const speed_t baud = to_termios_baud(baud_rate);
  if (baud == 0) {
    last_error_ = "unsupported baud rate: " + std::to_string(baud_rate);
    return false;
  }

  // O_NOCTTY：串口不要变成本进程的控制终端（防止收到的字节被当
  //           成终端控制字符处理）。
  // O_NONBLOCK：open 本身不阻塞；后续读写用 poll() 控制超时。
  fd_ = ::open(device.c_str(), O_RDWR | O_NOCTTY | O_NONBLOCK);
  if (fd_ < 0) {
    last_error_ = "open(" + device + ") failed: " + errno_text();
    return false;
  }

  termios tty{};
  if (tcgetattr(fd_, &tty) != 0) {
    last_error_ = "tcgetattr failed: " + errno_text();
    close();
    return false;
  }

  // cfmakeraw：一把关掉所有终端加工（回显、换行转换、信号字符等），
  // 得到"收到什么字节就是什么字节"的原始模式。
  cfmakeraw(&tty);

  // 8N1 无流控。cfmakeraw 已设 8 位数据、关校验，这里显式再写一遍，
  // 让配置意图一目了然。
  tty.c_cflag &= ~static_cast<tcflag_t>(PARENB);   // 无校验位
  tty.c_cflag &= ~static_cast<tcflag_t>(CSTOPB);   // 1 位停止位
  tty.c_cflag &= ~static_cast<tcflag_t>(CSIZE);
  tty.c_cflag |= static_cast<tcflag_t>(CS8);       // 8 位数据位
  tty.c_cflag &= ~static_cast<tcflag_t>(CRTSCTS);  // 无硬件流控
  tty.c_cflag |= static_cast<tcflag_t>(CREAD | CLOCAL);  // 使能接收

  // VMIN=0 + VTIME=0：read() 立即返回现有数据（可能 0 字节），
  // 等待逻辑完全交给 poll()。
  tty.c_cc[VMIN] = 0;
  tty.c_cc[VTIME] = 0;

  cfsetispeed(&tty, baud);
  cfsetospeed(&tty, baud);

  if (tcsetattr(fd_, TCSANOW, &tty) != 0) {
    last_error_ = "tcsetattr failed: " + errno_text();
    close();
    return false;
  }

  flush_buffers();
  last_error_.clear();
  return true;
}

void SerialPort::close() {
  if (fd_ >= 0) {
    ::close(fd_);
    fd_ = -1;
  }
}

bool SerialPort::write_all(const std::string& data,
                           std::chrono::milliseconds timeout) {
  if (fd_ < 0) {
    last_error_ = "write on closed port";
    return false;
  }

  size_t written = 0;
  const auto deadline = std::chrono::steady_clock::now() + timeout;

  while (written < data.size()) {
    const auto now = std::chrono::steady_clock::now();
    if (now >= deadline) {
      last_error_ = "write timed out";
      return false;
    }
    const auto remain_ms =
        std::chrono::duration_cast<std::chrono::milliseconds>(deadline - now);

    pollfd pfd{};
    pfd.fd = fd_;
    pfd.events = POLLOUT;
    const int ready = ::poll(&pfd, 1, static_cast<int>(remain_ms.count()));
    if (ready < 0) {
      if (errno == EINTR) {
        continue;  // 被信号打断不算错，重试。
      }
      last_error_ = std::string("poll(write) failed: ") + errno_text();
      return false;
    }
    if (ready == 0) {
      last_error_ = "write timed out";
      return false;
    }

    const ssize_t n =
        ::write(fd_, data.data() + written, data.size() - written);
    if (n < 0) {
      if (errno == EAGAIN || errno == EINTR) {
        continue;
      }
      last_error_ = std::string("write failed: ") + errno_text();
      return false;
    }
    written += static_cast<size_t>(n);
  }

  last_error_.clear();
  return true;
}

std::string SerialPort::read_available(std::chrono::milliseconds timeout) {
  if (fd_ < 0) {
    last_error_ = "read on closed port";
    return "";
  }

  pollfd pfd{};
  pfd.fd = fd_;
  pfd.events = POLLIN;
  const int ready = ::poll(&pfd, 1, static_cast<int>(timeout.count()));
  if (ready < 0) {
    if (errno != EINTR) {
      last_error_ = std::string("poll(read) failed: ") + errno_text();
    }
    return "";
  }
  if (ready == 0) {
    // 超时无数据：正常情况，不设置错误。
    last_error_.clear();
    return "";
  }

  char buffer[512] = {};
  const ssize_t n = ::read(fd_, buffer, sizeof(buffer));
  if (n < 0) {
    if (errno != EAGAIN && errno != EINTR) {
      last_error_ = std::string("read failed: ") + errno_text();
    }
    return "";
  }
  if (n == 0) {
    // 读到 EOF：USB 线被拔、设备消失。明确记为错误，
    // 便于上层把"拔线"与"暂时没数据"区分开。
    last_error_ = "device disconnected (EOF)";
    return "";
  }

  last_error_.clear();
  return std::string(buffer, static_cast<size_t>(n));
}

void SerialPort::flush_buffers() {
  if (fd_ >= 0) {
    tcflush(fd_, TCIOFLUSH);
  }
}

}  // namespace motor_driver
