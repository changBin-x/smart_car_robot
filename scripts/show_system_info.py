#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Author: ChangBin bin_chang@qq.com
Date: 2026-07-20 22:54:15
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-07-20 22:54:15
Copyright (c) 2026 by ChangBin bin_chang@qq.com, All Rights Reserved. 
Description: 树莓派 0.96寸 I2C OLED (SSD1306) 系统状态显示脚本。
在屏幕上实时绘制与刷新 CPU 使用率、CPU 温度、内存使用率及硬盘使用率。
支持 luma.oled、adafruit-circuitpython-ssd1306 库以及控制台 (--console) 调试模式。
"""

import argparse
import os
import signal
import sys
import time
from typing import Optional, Tuple

from PIL import Image, ImageDraw, ImageFont

try:
    import psutil
except ImportError:
    print("错误: 缺少 psutil 库，请执行 'pip install psutil' 进行安装。")
    sys.exit(1)


def get_cpu_usage() -> float:
    """获取当前系统的 CPU 使用率。

    Returns:
        float: CPU 使用百分比 (0.0 ~ 100.0)。
    """
    return psutil.cpu_percent(interval=None)


def get_cpu_temp() -> float:
    """获取 CPU 温度。

    优先读取树莓派 Linux sysfs thermal 节点，降级方案使用 psutil 传感器接口。

    Returns:
        float: CPU 温度值 (°C)，如果读取失败则返回 0.0。
    """
    thermal_path: str = "/sys/class/thermal/thermal_zone0/temp"
    if os.path.exists(thermal_path):
        try:
            with open(thermal_path, "r", encoding="utf-8") as thermal_file:
                temp_raw: str = thermal_file.read().strip()
                return float(temp_raw) / 1000.0
        except (ValueError, IOError):
            pass

    try:
        sensors_data = psutil.sensors_temperatures()
        for key in ("cpu_thermal", "coretemp", "soc_thermal"):
            if key in sensors_data and sensors_data[key]:
                return sensors_data[key][0].current
    except (AttributeError, KeyError, IndexError):
        pass

    return 0.0


def get_mem_usage() -> Tuple[float, float, float]:
    """获取内存使用状态。

    Returns:
        Tuple[float, float, float]: 包含 (使用率百分比 %, 已用大小 GB, 总大小 GB)。
    """
    mem = psutil.virtual_memory()
    total_gb: float = mem.total / (1024**3) if mem.total > 0 else 0.0
    used_gb: float = mem.used / (1024**3)
    return mem.percent, used_gb, total_gb


def get_disk_usage(path: str = "/") -> Tuple[float, float, float]:
    """获取指定路径挂载点的磁盘使用状态。

    Args:
        path (str): 磁盘挂载点路径，默认为根目录 "/"。

    Returns:
        Tuple[float, float, float]: 包含 (使用率百分比 %, 已用大小 GB, 总大小 GB)。
    """
    try:
        disk = psutil.disk_usage(path)
        total_gb: float = disk.total / (1024**3) if disk.total > 0 else 0.0
        used_gb: float = disk.used / (1024**3)
        return disk.percent, used_gb, total_gb
    except Exception:
        return 0.0, 0.0, 0.0


class OledDisplayAdapter:
    """OLED 显示屏驱动适配器类。

    封装 luma.oled 与 adafruit-circuitpython-ssd1306 库的差异，提供统一的显示接口。

    Attributes:
        width (int): 屏幕宽度 (像素)。
        height (int): 屏幕高度 (像素)。
        driver_type (Optional[str]): 匹配到的驱动库名称 ('luma' 或 'adafruit')。
        device (Any): 驱动实例对象。
    """

    def __init__(
        self, bus: int = 1, addr: int = 0x3C, width: int = 128, height: int = 64
    ) -> None:
        """初始化 OLED 驱动适配器。

        Args:
            bus (int): I2C 总线编号，默认为 1。
            addr (int): I2C 设备地址，默认为 0x3C。
            width (int): 屏幕宽度像素，默认为 128。
            height (int): 屏幕高度像素，默认为 64。

        Raises:
            RuntimeError: 当所有支持的 OLED 驱动库均加载失败时抛出异常。
        """
        self.width: int = width
        self.height: int = height
        self.driver_type: Optional[str] = None
        self.device = None

        luma_error: Optional[Exception] = None
        adafruit_error: Optional[Exception] = None

        # 尝试 1: 初始化 luma.oled
        try:
            from luma.core.interface.serial import i2c
            from luma.oled.device import ssd1306

            serial_interface = i2c(port=bus, address=addr)
            self.device = ssd1306(serial_interface, width=width, height=height)
            self.driver_type = "luma"
            print(
                f"[OLED] 成功通过 luma.oled 初始化 SSD1306 (Bus={bus}, Addr=0x{addr:02X})"
            )
            return
        except (ImportError, Exception) as err:
            luma_error = err

        # 尝试 2: 初始化 adafruit-circuitpython-ssd1306
        try:
            import board
            import busio
            import adafruit_ssd1306

            i2c_bus = busio.I2C(board.SCL, board.SDA)
            self.device = adafruit_ssd1306.SSD1306_I2C(
                width, height, i2c_bus, addr=addr
            )
            self.driver_type = "adafruit"
            print(
                f"[OLED] 成功通过 adafruit_ssd1306 初始化 SSD1306 (Bus={bus}, Addr=0x{addr:02X})"
            )
            return
        except (ImportError, Exception) as err:
            adafruit_error = err

        raise RuntimeError(
            f"无法初始化 OLED 屏幕。\n"
            f" - luma.oled 报错: {luma_error}\n"
            f" - adafruit_ssd1306 报错: {adafruit_error}\n"
            f"提示：请确保已安装硬件驱动库 (例如 `pip install luma.oled`)，且已开启 I2C 接口 (/dev/i2c-{bus})。"
        )

    def display(self, image: Image.Image) -> None:
        """将 PIL Image 对象发送并刷新到 OLED 屏幕。

        Args:
            image (Image.Image): 待显示的单色 PIL 图像对象。
        """
        if self.driver_type == "luma":
            self.device.display(image)
        elif self.driver_type == "adafruit":
            self.device.image(image)
            self.device.show()

    def clear(self) -> None:
        """清空屏幕显示内容。"""
        if self.driver_type == "luma":
            self.device.clear()
        elif self.driver_type == "adafruit":
            self.device.fill(0)
            self.device.show()


def create_info_image(
    width: int,
    height: int,
    font: ImageFont.ImageFont,
    font_bold: Optional[ImageFont.ImageFont] = None,
) -> Image.Image:
    """绘制 128x64 规格的系统监控画面图像。

    Args:
        width (int): 图像宽度 (像素)。
        height (int): 图像高度 (像素)。
        font (ImageFont.ImageFont): 常规文本字体。
        font_bold (Optional[ImageFont.ImageFont]): 粗体/强调文本字体。若为 None 则复用 font。

    Returns:
        Image.Image: 渲染完成的单色 (1-bit) PIL Image 图像。
    """
    image = Image.new("1", (width, height), 0)
    draw = ImageDraw.Draw(image)

    cpu_pct: float = get_cpu_usage()
    cpu_temp: float = get_cpu_temp()
    mem_pct, _, _ = get_mem_usage()
    disk_pct, _, _ = get_disk_usage()

    if font_bold is None:
        font_bold = font

    # 1. 标题栏绘制
    draw.rectangle((0, 0, width - 1, 13), outline=1, fill=1)
    draw.text((3, 0), "SYS MONITOR", font=font_bold, fill=0)
    draw.text((85, 0), f"{cpu_temp:.1f}C", font=font_bold, fill=0)

    # 2. CPU 使用率与进度条
    draw.text((2, 16), f"CPU  : {cpu_pct:5.1f}%", font=font, fill=1)
    bar_width_cpu: int = max(0, min(width - 80, int((width - 80) * (cpu_pct / 100.0))))
    draw.rectangle((76, 18, 76 + bar_width_cpu, 24), fill=1)

    # 3. 内存使用率与进度条
    draw.text((2, 31), f"MEM  : {mem_pct:5.1f}%", font=font, fill=1)
    bar_width_mem: int = max(0, min(width - 80, int((width - 80) * (mem_pct / 100.0))))
    draw.rectangle((76, 33, 76 + bar_width_mem, 39), fill=1)

    # 4. 硬盘使用率与进度条
    draw.text((2, 46), f"DISK : {disk_pct:5.1f}%", font=font, fill=1)
    bar_width_disk: int = max(
        0, min(width - 80, int((width - 80) * (disk_pct / 100.0)))
    )
    draw.rectangle((76, 48, 76 + bar_width_disk, 54), fill=1)

    return image


def print_console_info() -> None:
    """在终端控制台中格式化打印当前系统信息 (调试/无硬件模式)。"""
    cpu_pct: float = get_cpu_usage()
    cpu_temp: float = get_cpu_temp()
    mem_pct, mem_used, mem_total = get_mem_usage()
    disk_pct, disk_used, disk_total = get_disk_usage()

    sys.stdout.write("\033[H\033[J")
    print("=" * 40)
    print("         树莓派系统状态监控        ")
    print("=" * 40)
    print(f" CPU  使用率 : {cpu_pct:6.1f} %")
    print(f" CPU  温  度 : {cpu_temp:6.1f} °C")
    print(f" 内存 使用率 : {mem_pct:6.1f} %  ({mem_used:.1f}G / {mem_total:.1f}G)")
    print(f" 硬盘 使用率 : {disk_pct:6.1f} %  ({disk_used:.1f}G / {disk_total:.1f}G)")
    print("=" * 40)
    print("按 Ctrl+C 退出脚本...")


def main() -> None:
    """主函数入口：解析命令行参数并启动数据刷新主循环。"""
    parser = argparse.ArgumentParser(
        description="树莓派 0.96寸 I2C OLED 系统信息显示脚本"
    )
    parser.add_argument("--i2c-bus", type=int, default=1, help="I2C 总线编号 (默认: 1)")
    parser.add_argument(
        "--i2c-addr",
        type=lambda x: int(x, 16),
        default="0x3C",
        help="I2C 十六进制地址 (默认: 0x3C)",
    )
    parser.add_argument(
        "--width", type=int, default=128, help="屏幕宽度像素 (默认: 128)"
    )
    parser.add_argument(
        "--height", type=int, default=64, help="屏幕高度像素 (默认: 64)"
    )
    parser.add_argument(
        "--interval", type=float, default=1.0, help="刷新间隔秒数 (默认: 1.0)"
    )
    parser.add_argument(
        "--console",
        action="store_true",
        help="强制仅使用终端控制台输出 (用于无 OLED 硬件测试)",
    )

    args = parser.parse_args()

    oled: Optional[OledDisplayAdapter] = None
    if not args.console:
        try:
            oled = OledDisplayAdapter(
                bus=args.i2c_bus,
                addr=args.i2c_addr,
                width=args.width,
                height=args.height,
            )
        except RuntimeError as err:
            print(f"[提示] {err}")
            print("[提示] 自动切换到控制台打印模式 (--console)。\n")

    try:
        font = ImageFont.load_default()
        font_bold = ImageFont.load_default()
    except Exception:
        font = None
        font_bold = None

    # 初始化 psutil CPU 采样起点
    psutil.cpu_percent(interval=None)

    running: bool = True

    def signal_handler(sig, frame):
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        while running:
            if oled:
                img = create_info_image(args.width, args.height, font, font_bold)
                oled.display(img)
            else:
                print_console_info()

            time.sleep(args.interval)
    finally:
        if oled:
            try:
                oled.clear()
                print("[OLED] 屏幕已清空退出。")
            except Exception:
                pass


if __name__ == "__main__":
    main()
