#!/usr/bin/env zsh
# Copyright (c) 2026 by ChangBin, All Rights Reserved.
#
# Author: ChangBin bin_chang@qq.com
# Date: 2026-08-03
# LastEditors: ChangBin bin_chang@qq.com
# LastEditTime: 2026-08-03
# Description: Probe whether one V4L2 camera device can be opened by two ustreamer processes concurrently.

# 探测同一 /dev/video0 是否可同时跑两个 ustreamer。
set -euo pipefail

readonly DEVICE="${1:-/dev/video0}"
readonly PRIMARY_PORT="18080"
readonly SECONDARY_PORT="18081"

PID1=""
PID2=""
STARTED_PID=""
FIRST_FAIL_RESULT=""

log_info() {
  echo "INFO: $*"
}

log_error() {
  echo "ERROR: $*" >&2
}

cleanup() {
  if [[ -n "${PID1}" ]]; then
    kill "${PID1}" 2>/dev/null || true
  fi
  if [[ -n "${PID2}" ]]; then
    kill "${PID2}" 2>/dev/null || true
  fi
}

start_ustreamer() {
  local device="$1"
  local port="$2"
  local resolution="$3"
  local fps="$4"
  local format="$5"
  local encoder="$6"

  ustreamer --device="${device}" --host=127.0.0.1 --port="${port}" \
    --resolution="${resolution}" --desired-fps="${fps}" \
    --format="${format}" --encoder="${encoder}" \
    --exit-on-parent-death &
  STARTED_PID="$!"
}

probe_with_format() {
  local format="$1"
  local encoder="$2"

  FIRST_FAIL_RESULT=""
  start_ustreamer "${DEVICE}" "${PRIMARY_PORT}" "640x480" "15" "${format}" "${encoder}"
  PID1="${STARTED_PID}"
  sleep 1
  if ! kill -0 "${PID1}" 2>/dev/null; then
    FIRST_FAIL_RESULT="FAIL_FIRST_${format}_${encoder}"
    PID1=""
    return 1
  fi

  start_ustreamer "${DEVICE}" "${SECONDARY_PORT}" "1280x720" "10" "${format}" "${encoder}"
  PID2="${STARTED_PID}"
  sleep 2
  if kill -0 "${PID2}" 2>/dev/null; then
    echo "PROBE_RESULT=DUAL_OK"
    cleanup
    return 0
  fi

  echo "PROBE_RESULT=SINGLE_ONLY"
  PID2=""
  cleanup
  return 2
}

main() {
  trap cleanup EXIT

  if ! command -v ustreamer >/dev/null 2>&1; then
    log_error "ustreamer is not installed or not in PATH."
    echo "PROBE_RESULT=FAIL_USTREAMER_NOT_FOUND"
    return 1
  fi

  pkill -f "ustreamer --device" 2>/dev/null || true
  sleep 0.5

  if probe_with_format "JPEG" "HW"; then
    return 0
  fi

  local result="$?"
  if [[ "${result}" -eq 1 ]]; then
    log_info "${FIRST_FAIL_RESULT}; retrying with YUYV+CPU."
    cleanup
    sleep 0.5
    if probe_with_format "YUYV" "CPU"; then
      return 0
    fi
    result="$?"
    if [[ "${result}" -eq 1 ]]; then
      echo "PROBE_RESULT=${FIRST_FAIL_RESULT}"
    fi
    return "${result}"
  fi

  return "${result}"
}

main "$@"
