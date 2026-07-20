#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Author: ChangBin bin_chang@qq.com
Date: 2026-07-20 22:54:15
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-07-20 22:54:15
Copyright (c) 2026 by ChangBin bin_chang@qq.com, All Rights Reserved. 
Description: 树莓派 0.96寸 I2C OLED (SSD1306) 系统状态显示脚本。
在屏幕上实时显示 CPU 使用率、CPU 温度、内存使用率、硬盘使用率及当前时间。
使用 luma.oled 驱动库，三行文本布局，固定 1 秒刷新间隔。
"""

import time
import psutil
from luma.oled.device import ssd1306
from luma.core.interface.serial import i2c
from luma.core.render import canvas
from PIL import ImageFont

# ---------- OLED 配置 ----------
I2C_ADDRESS = 0x3C
WIDTH = 128
HEIGHT = 64

serial = i2c(port=1, address=I2C_ADDRESS)
device = ssd1306(serial, width=WIDTH, height=HEIGHT, contrast=255)

# ---------- 字体配置 ----------
# 使用 12px 字体，三行完美容纳且视觉清晰
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 12)
except Exception:
    font = ImageFont.load_default()


# ---------- 系统信息采集 ----------
def get_cpu_usage():
    # interval=None 避免阻塞，确保循环严格按 1s 周期执行
    return int(round(psutil.cpu_percent(interval=None)))


def get_cpu_temp():
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
            return int(round(int(f.read()) / 1000.0))
    except Exception:
        return 0


def get_memory_usage():
    return int(round(psutil.virtual_memory().percent))


def get_disk_usage():
    return int(round(psutil.disk_usage('/').percent))


# ---------- 主逻辑 ----------
def main():
    print("OLED 系统信息显示已启动（三行模式），按 Ctrl+C 退出")

    # 预热 CPU 采样，避免首次读取为 0%
    psutil.cpu_percent(interval=None)

    while True:
        cpu = get_cpu_usage()
        temp = get_cpu_temp()
        mem = get_memory_usage()
        disk = get_disk_usage()
        now_str = time.strftime("%m-%d %H:%M:%S")

        # 各行文本组装
        line1_str = f"U:{cpu}%, T:{temp}°C"
        line2_str = f"R:{mem}%, D:{disk}%"
        line3_str = now_str

        with canvas(device) as draw:
            # 清屏
            draw.rectangle((0, 0, WIDTH - 1, HEIGHT - 1), outline="black", fill="black")

            # ---- 第一行：CPU 与 温度 ----
            draw.text((0, 4), line1_str, font=font, fill="white")

            # ---- 第二行：内存 与 磁盘 ----
            draw.text((0, 24), line2_str, font=font, fill="white")

            # ---- 第三行：年月日-时分秒 ----
            draw.text((0, 44), line3_str, font=font, fill="white")

        # 保证精准 1 秒刷新
        time.sleep(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n已安全退出并清屏")
        device.clear()
        device.hide()
