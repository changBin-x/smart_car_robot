#!/usr/bin/env bash
# setup_clangd.sh —— 为 clangd 生成合并的 compile_commands.json
#
# 用法：
#   cd <ws>/src/scripts && ./setup_clangd.sh
#
# 行为：
#   1. 确保已用 -DCMAKE_EXPORT_COMPILE_COMMANDS=ON 编译（否则先调用 build.sh）
#   2. 收集 <ws>/build/*/compile_commands.json 合并为一个数组
#   3. 写入 <ws>/src/compile_commands.json（与 .clangd 同目录，clangd 自动发现）
#
# 设计说明：
#   - clangd 从源文件向上查找 compile_commands.json；放在仓库根（src/）即可
#     覆盖 motor_driver、smartcar_bringup 等所有包。
#   - 合并用 python3 完成，避免依赖 jq；仅用标准库。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # <ws>/src/scripts
SRC_DIR="$(dirname "$SCRIPT_DIR")"                           # <ws>/src
WS_DIR="$(dirname "$SRC_DIR")"                               # <ws>
BUILD_DIR="$WS_DIR/build"

# ---- 若尚未编译，先编译 ----
if [[ ! -d "$BUILD_DIR" ]]; then
  echo "[clangd] 未发现 build/，先执行编译……"
  "$SCRIPT_DIR/build.sh"
fi

# ---- 收集各包的 compile_commands.json ----
mapfile -t DBS < <(find "$BUILD_DIR" -maxdepth 2 -name compile_commands.json 2>/dev/null)
if [[ ${#DBS[@]} -eq 0 ]]; then
  echo "[clangd] 错误：未找到任何 compile_commands.json。" >&2
  echo "[clangd] 请先运行 build.sh（已开启 CMAKE_EXPORT_COMPILE_COMMANDS）。" >&2
  exit 1
fi

echo "[clangd] 合并 ${#DBS[@]} 个编译数据库……"

# ---- 用 python3 合并去重，写入仓库根 ----
OUT="$SRC_DIR/compile_commands.json"
python3 - "$OUT" "${DBS[@]}" <<'PY'
import json
import sys

out_path = sys.argv[1]
db_paths = sys.argv[2:]

merged = []
seen = set()
for path in db_paths:
    try:
        with open(path, "r", encoding="utf-8") as f:
            entries = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[clangd] 跳过无法解析的 {path}: {exc}", file=sys.stderr)
        continue
    for entry in entries:
        # 以 (目录, 文件) 去重，防止重复编译单元干扰 clangd
        key = (entry.get("directory", ""), entry.get("file", ""))
        if key in seen:
            continue
        seen.add(key)
        merged.append(entry)

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(merged, f, indent=2, ensure_ascii=False)

print(f"[clangd] 已写入 {out_path}，共 {len(merged)} 个编译单元")
PY

echo "[clangd] 完成。重启编辑器或 clangd 语言服务器即可生效。"
