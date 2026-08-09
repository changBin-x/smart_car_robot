"""海康 USB 单目相机文档与标定资产契约测试。

Author: ChangBin bin_chang@qq.com
Date: 2026-08-10
LastEditors: ChangBin bin_chang@qq.com
LastEditTime: 2026-08-10
Copyright (c) 2026 by ChangBin, All Rights Reserved.
Description: 验证可打印棋盘格尺寸，以及用户文档不再引导旧相机链路。
"""

from pathlib import Path


# 仓库根目录：test/ -> hik_camera_bringup/ -> src/ -> repo root。
ROOT = Path(__file__).parents[3]
# 可打印的相机标定棋盘格 SVG 源文件。
CHESSBOARD_SVG = ROOT / "docs/camera/hik_monocular_chessboard.svg"
# 所有面向用户的现行说明，不能继续引导旧相机链路。
CURRENT_DOCUMENTS = [
    ROOT / "README.md",
    ROOT / "docs/ROS-Jazzy通信接口.md",
    ROOT / "src/smartcar_bringup/README.md",
    ROOT / "src/smartcar_bringup/doc/验证手册.md",
    ROOT / "src/hik_camera_bringup/doc/验证手册.md",
    ROOT / "topside/README.md",
    ROOT / "scripts/README.md",
]


def test_calibration_board_is_a4_landscape_25mm_pattern() -> None:
    """棋盘格必须满足已确认的打印尺寸和角点数量。"""
    svg = CHESSBOARD_SVG.read_text(encoding="utf-8")

    assert 'width="297mm"' in svg
    assert 'height="210mm"' in svg
    assert "9 columns x 7 rows" in svg
    assert "25 mm" in svg


def test_current_docs_do_not_recommend_legacy_camera_pipeline() -> None:
    """现行用户文档不得继续指导旧采集和旧质量控制接口。"""
    legacy_terms = ("ustreamer", "8082", "use_camera")

    for document in CURRENT_DOCUMENTS:
        content = document.read_text(encoding="utf-8")
        for legacy_term in legacy_terms:
            assert legacy_term not in content, document


def test_camera_docs_describe_the_validated_mjpeg_bridge() -> None:
    """相机说明必须明确内部原始话题和外部 BGR 接口的边界。"""
    package_document = (
        ROOT / "src/hik_camera_bringup/doc/验证手册.md"
    ).read_text(encoding="utf-8")
    root_document = (ROOT / "README.md").read_text(encoding="utf-8")

    for document in (package_document, root_document):
        assert "/hik_monocular/driver/image_raw" in document
        assert "/hik_monocular/image_raw" in document
        assert "bgr8" in document
