/**
 * @file cameraStream.js
 * @description 上位机摄像机 MJPEG 流 URL 纯函数工具：从 rosbridge URL 解析主机、
 *   按 single/dual 模式拼装推流与质量切换地址，以及重连退避延迟。
 *   探测结论 UVC 不能真双开，故 CAMERA_STREAM_MODE 固定为 'single'。
 * @author ChangBin <bin_chang@qq.com>
 * @date 2026-08-04 00:18:37
 * @lastEditors ChangBin <bin_chang@qq.com>
 * @lastEditTime 2026-08-04
 * @copyright Copyright (c) 2026 by ChangBin, All Rights Reserved.
 */

/**
 * 推流部署模式。探测实质为 SINGLE_ONLY，固定为 single。
 * dual 仅保留在 buildStreamUrl 的 options.mode 中以兼容旧逻辑。
 * @type {'single'}
 */
export const CAMERA_STREAM_MODE = 'single';

/**
 * 从 rosbridge WebSocket/HTTP URL 提取主机名。
 *
 * @param {string} rosUrl rosbridge 连接地址，例如 ws://192.168.10.17:9090。
 * @param {string} [fallback='192.168.10.17'] 解析失败时的默认主机。
 * @returns {string} 主机名或 fallback。
 */
export function hostFromRosUrl(rosUrl, fallback = '192.168.10.17') {
  try {
    const normalized = String(rosUrl || '').replace(/^ws:/i, 'http:');
    const host = new URL(normalized).hostname;
    return host || fallback;
  } catch {
    return fallback;
  }
}

/**
 * 构建 MJPEG 推流 URL。
 *
 * - mode 默认取 CAMERA_STREAM_MODE（single），也可由 options.mode 覆盖。
 * - dual 时 high 使用 8081（兼容旧双实例部署）。
 * - single 时始终使用 8080；若 options.cacheBust != null 则追加 ?t=<cacheBust>。
 *
 * @param {string} host 机器人主机名或 IP。
 * @param {'low'|'high'} quality 画质档位（dual 下决定端口；single 下不影响端口）。
 * @param {object} [options={}] 可选参数。
 * @param {'single'|'dual'} [options.mode] 推流模式，默认 CAMERA_STREAM_MODE。
 * @param {number} [options.lowPort=8080] low 档端口。
 * @param {number} [options.highPort=8081] dual 模式下 high 档端口。
 * @param {number|string|null} [options.cacheBust] single 模式下的缓存破坏参数。
 * @returns {string} 完整推流 URL。
 */
export function buildStreamUrl(host, quality, options = {}) {
  const mode = options.mode || CAMERA_STREAM_MODE;
  const lowPort = options.lowPort || 8080;
  const highPort = options.highPort || 8081;
  const port = quality === 'high' && mode === 'dual' ? highPort : lowPort;
  const base = `http://${host}:${port}/stream`;
  if (mode === 'single' && options.cacheBust != null) {
    return `${base}?t=${options.cacheBust}`;
  }
  return base;
}

/**
 * 构建质量切换控制 URL（single 模式下切档用）。
 *
 * @param {string} host 机器人主机名或 IP。
 * @param {'low'|'high'} quality 目标画质。
 * @param {number} [ctlPort=8082] 质量控制服务端口。
 * @returns {string} 例如 http://host:8082/quality?mode=high。
 */
export function buildQualityCtlUrl(host, quality, ctlPort = 8082) {
  return `http://${host}:${ctlPort}/quality?mode=${quality}`;
}

/**
 * 计算 img 重连退避延迟（毫秒），指数增长并封顶 8000。
 *
 * @param {number} attempt 重连次数（从 0 起）；负数按 0 处理。
 * @returns {number} 延迟毫秒数，范围 [1000, 8000]。
 */
export function nextReconnectDelayMs(attempt) {
  return Math.min(8000, 1000 * 2 ** Math.max(0, attempt));
}
