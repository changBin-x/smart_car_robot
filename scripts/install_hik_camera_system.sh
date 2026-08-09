#!/usr/bin/env bash
# Author: ChangBin bin_chang@qq.com
# Date: 2026-08-10
# LastEditors: ChangBin bin_chang@qq.com
# LastEditTime: 2026-08-10
# Copyright (c) 2026 by ChangBin, All Rights Reserved.
# Description: 在显式开关下安装海康 USB 相机的 udev、USB 缓冲和可选 RT 服务。

set -euo pipefail

INSTALL_UDEV=false
CONFIGURE_USB_BUFFER=false
INSTALL_RT_SERVICE=false
WORKSPACE="/home/bean/smart_car_robot"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CAMERA_PACKAGE_DIR="${SCRIPT_DIR}/../src/hik_camera_bringup"
UDEV_SOURCE="${CAMERA_PACKAGE_DIR}/config/99-hik-monocular.rules"
SERVICE_SOURCE="${CAMERA_PACKAGE_DIR}/config/hik-camera.service"
UDEV_TARGET="/etc/udev/rules.d/99-hik-monocular.rules"
SERVICE_TARGET="/etc/systemd/system/hik-camera.service"
USB_BUFFER_PARAMETER="usbcore.usbfs_memory_mb=128"


print_usage() {
  cat <<'EOF'
用法：install_hik_camera_system.sh [选项]

仅在显式指定对应选项时修改系统：
  --install-udev           安装 /dev/hik_monocular 的 udev 规则。
  --configure-usb-buffer   在树莓派内核命令行中添加 USB 缓冲参数。
  --install-rt-service     安装但不启用 FIFO 相机 systemd 服务。
  --workspace <绝对路径>   RT 服务所使用的 ROS 2 工作区。
  --help                   显示本帮助信息。
EOF
}


fail() {
  echo "[hik-camera] 错误：$*" >&2
  exit 1
}


require_file() {
  local file_path="$1"
  if [[ ! -f "${file_path}" ]]; then
    fail "找不到必需文件：${file_path}"
  fi
}


find_cmdline_path() {
  local candidate
  for candidate in /boot/firmware/cmdline.txt /boot/cmdline.txt; do
    if [[ -f "${candidate}" ]]; then
      echo "${candidate}"
      return 0
    fi
  done
  return 1
}


install_udev_rule() {
  require_file "${UDEV_SOURCE}"
  sudo install -m 0644 "${UDEV_SOURCE}" "${UDEV_TARGET}"
  sudo udevadm control --reload-rules
  sudo udevadm trigger --subsystem-match=video4linux
  echo "[hik-camera] 已安装 udev 规则：${UDEV_TARGET}"
}


configure_usb_buffer() {
  local cmdline_path
  local backup_path
  local temporary_path

  cmdline_path="$(find_cmdline_path)" || fail "找不到树莓派内核命令行文件"
  if grep -Eq "(^| )${USB_BUFFER_PARAMETER}($| )" "${cmdline_path}"; then
    echo "[hik-camera] USB 缓冲参数已存在：${USB_BUFFER_PARAMETER}"
    return 0
  fi

  backup_path="${cmdline_path}.$(date +%Y%m%d%H%M%S).bak"
  temporary_path="$(mktemp)"
  trap 'rm -f "${temporary_path}"' RETURN
  sed "1s|$| ${USB_BUFFER_PARAMETER}|" "${cmdline_path}" > "${temporary_path}"
  sudo cp "${cmdline_path}" "${backup_path}"
  sudo install -m 0644 "${temporary_path}" "${cmdline_path}"
  echo "[hik-camera] 已写入 USB 缓冲参数；备份文件：${backup_path}"
}


install_rt_service() {
  local escaped_workspace
  local temporary_path

  require_file "${SERVICE_SOURCE}"
  [[ "${WORKSPACE}" == /* ]] || fail "--workspace 必须是绝对路径"
  [[ -d "${WORKSPACE}" ]] || fail "工作区不存在：${WORKSPACE}"
  escaped_workspace="${WORKSPACE//&/\\&}"
  temporary_path="$(mktemp)"
  trap 'rm -f "${temporary_path}"' RETURN
  sed "s|@WORKSPACE@|${escaped_workspace}|g" "${SERVICE_SOURCE}" > "${temporary_path}"
  sudo install -m 0644 "${temporary_path}" "${SERVICE_TARGET}"
  sudo systemctl daemon-reload
  echo "[hik-camera] 已安装但未启用 RT 服务：${SERVICE_TARGET}"
}


while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-udev)
      INSTALL_UDEV=true
      ;;
    --configure-usb-buffer)
      CONFIGURE_USB_BUFFER=true
      ;;
    --install-rt-service)
      INSTALL_RT_SERVICE=true
      ;;
    --workspace)
      [[ $# -ge 2 ]] || fail "--workspace 缺少路径参数"
      WORKSPACE="$2"
      shift
      ;;
    --help)
      print_usage
      exit 0
      ;;
    *)
      fail "未知选项：$1；使用 --help 查看帮助"
      ;;
  esac
  shift
done

if [[ "${INSTALL_UDEV}" == false && "${CONFIGURE_USB_BUFFER}" == false && "${INSTALL_RT_SERVICE}" == false ]]; then
  print_usage
  exit 0
fi

if [[ "${INSTALL_UDEV}" == true ]]; then
  install_udev_rule
fi
if [[ "${CONFIGURE_USB_BUFFER}" == true ]]; then
  configure_usb_buffer
fi
if [[ "${INSTALL_RT_SERVICE}" == true ]]; then
  install_rt_service
fi
