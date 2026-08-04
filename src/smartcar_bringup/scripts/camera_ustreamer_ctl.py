#!/usr/bin/env python3
"""
Author: ChangBin bin_chang@qq.com
Date: 2026-08-03
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-08-04
Copyright (c) 2026 by ChangBin, All Rights Reserved.
Description: 管理单实例 ustreamer 进程，并提供 HTTP 质量切换控制口。
"""

from __future__ import annotations

import argparse
import errno
import fcntl
import http.server
import json
import os
import signal
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from typing import Any
from typing import TextIO
from urllib import error
from urllib import parse
from urllib import request


DEFAULT_DEVICE = "/dev/video0"
DEFAULT_HOST = "0.0.0.0"
DEFAULT_STREAM_PORT = 8080
DEFAULT_CTL_PORT = 8082
DEFAULT_LOCK_FILE = "/tmp/smartcar_camera_ustreamer.lock"
USTREAMER_BIN = "ustreamer"
STOP_TIMEOUT_S = 3.0
STARTUP_TIMEOUT_S = 2.5
STATE_REQUEST_TIMEOUT_S = 0.5
STARTUP_POLL_INTERVAL_S = 0.1


@dataclass(frozen=True)
class QualityProfile:
    """描述一个 ustreamer 推流质量档位。"""

    width: int
    height: int
    fps: int

    @property
    def resolution(self) -> str:
        """返回 ustreamer 接受的分辨率字符串。"""
        return f"{self.width}x{self.height}"


QUALITY_PROFILES = {
    "low": QualityProfile(width=640, height=480, fps=30),
    "high": QualityProfile(width=1280, height=720, fps=15),
}


class ProcessLock:
    """用 flock 持有进程级互斥锁，防止多控制器抢同一摄像头。"""

    def __init__(self, lock_file: str) -> None:
        """初始化锁对象。

        Args:
            lock_file: 用于 flock 的锁文件路径。
        """
        self._lock_file = lock_file
        self._file: TextIO | None = None

    def acquire(self) -> None:
        """非阻塞获取进程锁。

        Raises:
            RuntimeError: 已有其他进程持有锁。
            OSError: 锁文件无法打开或写入。
        """
        lock_file = open(self._lock_file, "a+", encoding="utf-8")
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            lock_file.close()
            if exc.errno not in (errno.EACCES, errno.EAGAIN):
                raise
            raise RuntimeError(
                "another camera_ustreamer_ctl instance is running; "
                f"lock file: {self._lock_file}"
            ) from exc

        lock_file.seek(0)
        lock_file.truncate()
        lock_file.write(f"{os.getpid()}\n")
        lock_file.flush()
        self._file = lock_file

    def release(self) -> None:
        """释放进程锁。"""
        if self._file is None:
            return

        fcntl.flock(self._file.fileno(), fcntl.LOCK_UN)
        self._file.close()
        self._file = None


class CameraUstreamerController:
    """以单进程方式管理 ustreamer，避免同一 UVC 设备被双开。"""

    def __init__(
        self,
        *,
        device: str,
        stream_port: int,
        host: str,
    ) -> None:
        """初始化控制器。

        Args:
            device: 摄像头设备路径，例如 /dev/video0。
            stream_port: ustreamer MJPEG HTTP 推流端口。
            host: ustreamer 与控制服务监听地址。
        """
        self._device = device
        self._stream_port = stream_port
        self._host = host
        self._mode = "low"
        self._process: subprocess.Popen[bytes] | None = None
        self._lock = threading.Lock()

    @property
    def mode(self) -> str:
        """返回当前目标质量档位。"""
        return self._mode

    @property
    def pid(self) -> int | None:
        """返回当前 ustreamer 进程 PID；进程不存在时返回 None。"""
        with self._lock:
            if self._process is None or self._process.poll() is not None:
                return None
            return self._process.pid

    def start(self, mode: str = "low") -> None:
        """启动指定质量档位的 ustreamer 进程。

        Args:
            mode: 质量档位，必须是 low 或 high。

        Raises:
            ValueError: mode 不在支持列表中。
            OSError: ustreamer 启动失败。
            RuntimeError: ustreamer 退出或状态未进入 online。
        """
        if mode not in QUALITY_PROFILES:
            raise ValueError(f"unsupported quality mode: {mode}")

        with self._lock:
            self._stop_locked()
            process = subprocess.Popen(self._build_command(mode))
            try:
                self._wait_until_started(process)
            except Exception:
                self._stop_process(process)
                raise

            self._process = process
            self._mode = mode

    def stop(self) -> None:
        """停止当前 ustreamer 子进程。"""
        with self._lock:
            self._stop_locked()

    def health(self) -> dict[str, Any]:
        """返回控制器健康状态。"""
        pid = self.pid
        return {
            "ok": pid is not None,
            "mode": self._mode,
            "pid": pid,
        }

    def _stop_locked(self) -> None:
        """在持锁状态下停止 ustreamer 子进程。"""
        if self._process is None:
            return

        process = self._process
        self._process = None
        if process.poll() is not None:
            return

        process.terminate()
        try:
            process.wait(timeout=STOP_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=STOP_TIMEOUT_S)

    def _stop_process(self, process: subprocess.Popen[bytes]) -> None:
        """停止指定 ustreamer 子进程。"""
        if process.poll() is not None:
            return

        process.terminate()
        try:
            process.wait(timeout=STOP_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=STOP_TIMEOUT_S)

    def _wait_until_started(self, process: subprocess.Popen[bytes]) -> None:
        """等待 ustreamer 子进程存活且 /state 报告 source.online=true。

        Args:
            process: 刚启动的 ustreamer 子进程。

        Raises:
            RuntimeError: 进程提前退出或状态检查超时。
        """
        deadline = time.monotonic() + STARTUP_TIMEOUT_S
        last_error = "source.online is false"

        while time.monotonic() < deadline:
            exit_code = process.poll()
            if exit_code is not None:
                raise RuntimeError(
                    "ustreamer exited during startup "
                    f"with code {exit_code}"
                )

            try:
                if self._state_online():
                    return
            except (
                error.URLError,
                TimeoutError,
                json.JSONDecodeError,
                OSError,
            ) as exc:
                last_error = str(exc)

            time.sleep(STARTUP_POLL_INTERVAL_S)

        if process.poll() is not None:
            raise RuntimeError("ustreamer exited during startup")

        raise RuntimeError(
            "ustreamer state did not become online "
            f"within {STARTUP_TIMEOUT_S:.1f}s: {last_error}"
        )

    def _state_online(self) -> bool:
        """读取 ustreamer /state，确认采集源已 online。"""
        url = f"http://127.0.0.1:{self._stream_port}/state"
        with request.urlopen(url, timeout=STATE_REQUEST_TIMEOUT_S) as response:
            payload = json.load(response)

        result = payload.get("result")
        if isinstance(result, dict):
            source = result.get("source")
            if isinstance(source, dict):
                return source.get("online") is True

        source = payload.get("source")
        if isinstance(source, dict):
            return source.get("online") is True

        return payload.get("online") is True

    def _build_command(self, mode: str) -> list[str]:
        """构造 ustreamer 命令行参数。

        注意：不要附加 --exit-on-parent-death。该选项基于
        PR_SET_PDEATHSIG，信号会绑定到调用 fork 的线程；质量切换在
        ThreadingHTTPServer 工作线程中 Popen 时，请求结束后该线程退出会
        误杀刚拉起的 ustreamer。生命周期改由本控制器显式 stop/terminate。
        """
        profile = QUALITY_PROFILES[mode]
        return [
            USTREAMER_BIN,
            "--device",
            self._device,
            "--host",
            self._host,
            "--port",
            str(self._stream_port),
            "--resolution",
            profile.resolution,
            "--desired-fps",
            str(profile.fps),
            "--format=YUYV",
            "--encoder=CPU",
            "--allow-origin=*",
            "--slowdown",
        ]


class CameraControlHandler(http.server.BaseHTTPRequestHandler):
    """处理 camera_ustreamer_ctl.py 的 HTTP 控制请求。"""

    controller: CameraUstreamerController

    def do_GET(self) -> None:
        """处理 GET /health 与 GET /quality?mode=low|high。"""
        url = parse.urlparse(self.path)
        if url.path == "/health":
            self._write_json(http.HTTPStatus.OK, self.controller.health())
            return

        if url.path == "/quality":
            self._handle_quality(url.query)
            return

        self._write_json(
            http.HTTPStatus.NOT_FOUND,
            {"ok": False, "error": "not found"},
        )

    def log_message(self, fmt: str, *args: Any) -> None:
        """把 HTTP 访问日志写到 stderr，保留标准库默认信息量。"""
        sys.stderr.write(
            "%s - - [%s] %s\n"
            % (self.address_string(), self.log_date_time_string(), fmt % args)
        )

    def _handle_quality(self, query: str) -> None:
        """处理质量切换请求。"""
        mode = parse.parse_qs(query).get("mode", [""])[0]
        if mode not in QUALITY_PROFILES:
            self._write_json(
                http.HTTPStatus.BAD_REQUEST,
                {
                    "ok": False,
                    "error": "mode must be low or high",
                },
            )
            return

        try:
            self.controller.start(mode)
        except Exception as exc:
            self._write_json(
                http.HTTPStatus.INTERNAL_SERVER_ERROR,
                {"ok": False, "error": str(exc)},
            )
            return

        self._write_json(http.HTTPStatus.OK, {"ok": True, "mode": mode})

    def _write_json(
        self,
        status: http.HTTPStatus,
        payload: dict[str, Any],
    ) -> None:
        """写出 JSON 响应。"""
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def parse_args(argv: list[str]) -> argparse.Namespace:
    """解析命令行参数。"""
    parser = argparse.ArgumentParser(
        description="Run one ustreamer instance with quality switch control."
    )
    parser.add_argument("--device", default=DEFAULT_DEVICE)
    parser.add_argument("--stream-port", type=int, default=DEFAULT_STREAM_PORT)
    parser.add_argument("--ctl-port", type=int, default=DEFAULT_CTL_PORT)
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--lock-file", default=DEFAULT_LOCK_FILE)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    """程序入口。"""
    args = parse_args(argv)
    controller = CameraUstreamerController(
        device=args.device,
        stream_port=args.stream_port,
        host=args.host,
    )
    CameraControlHandler.controller = controller
    process_lock = ProcessLock(args.lock_file)
    server: http.server.ThreadingHTTPServer | None = None
    try:
        process_lock.acquire()
        server = http.server.ThreadingHTTPServer(
            (args.host, args.ctl_port),
            CameraControlHandler,
        )

        def _handle_signal(signum: int, _frame: Any) -> None:
            """异步停止 HTTP 服务，避免在信号处理路径中阻塞主线程。"""
            del signum
            if server is not None:
                threading.Thread(target=server.shutdown, daemon=True).start()

        signal.signal(signal.SIGINT, _handle_signal)
        signal.signal(signal.SIGTERM, _handle_signal)

        controller.start("low")
        server.serve_forever()
    except Exception as exc:
        sys.stderr.write(f"camera_ustreamer_ctl failed: {exc}\n")
        return os.EX_SOFTWARE
    finally:
        controller.stop()
        if server is not None:
            server.server_close()
        process_lock.release()

    return os.EX_OK


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
