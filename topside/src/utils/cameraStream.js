/**
 * @file cameraStream.js
 * @description 构建 web_video_server 的单路相机预览 URL，并提供断流重连退避。
 * @author ChangBin <bin_chang@qq.com>
 * @date 2026-08-10
 * @lastEditors ChangBin <bin_chang@qq.com>
 * @lastEditTime 2026-08-10
 * @copyright Copyright (c) 2026 by ChangBin, All Rights Reserved.
 */

/** ROS 原始相机图像话题。 */
export const CAMERA_TOPIC = '/hik_monocular/image_raw';
/** web_video_server 的 HTTP 端口。 */
export const WEB_VIDEO_PORT = 8080;
/** 浏览器预览的性能门控参数，避免直接传输 1080P 图像。 */
export const WEB_PREVIEW = { width: 640, height: 360, quality: 70 };
/** 用于区分上位机预览连接的服务器客户端标识。 */
const WEB_CLIENT_ID = 'topside-camera';

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
 * 构建 web_video_server 的单路 MJPEG 预览 URL。
 *
 * @param {string} host 机器人主机名或 IP。
 * @returns {string} 带固定话题、缩放和编码质量参数的完整预览 URL。
 */
export function buildStreamUrl(host) {
  const parameters = new URLSearchParams({
    topic: CAMERA_TOPIC,
    width: String(WEB_PREVIEW.width),
    height: String(WEB_PREVIEW.height),
    quality: String(WEB_PREVIEW.quality),
    client_id: WEB_CLIENT_ID,
  });
  return `http://${host}:${WEB_VIDEO_PORT}/stream?${parameters.toString()}`;
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
