/**
 * @file cameraStream.test.js
 * @description web_video_server 相机预览 URL 与重连退避单元测试。
 * @author ChangBin <bin_chang@qq.com>
 * @date 2026-08-10
 * @lastEditors ChangBin <bin_chang@qq.com>
 * @lastEditTime 2026-08-10
 * @copyright Copyright (c) 2026 by ChangBin, All Rights Reserved.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMERA_TOPIC,
  WEB_PREVIEW,
  WEB_VIDEO_PORT,
  buildStreamUrl,
  hostFromRosUrl,
  nextReconnectDelayMs,
} from './cameraStream.js';

describe('Web 视频预览常量', () => {
  it('locks the ROS image topic and preview dimensions', () => {
    assert.equal(CAMERA_TOPIC, '/hik_monocular/image_raw');
    assert.equal(WEB_VIDEO_PORT, 8080);
    assert.deepEqual(WEB_PREVIEW, { width: 640, height: 360, quality: 70 });
  });
});

describe('hostFromRosUrl', () => {
  it('parses ws url hostname', () => {
    assert.equal(hostFromRosUrl('ws://192.168.10.17:9090'), '192.168.10.17');
  });

  it('parses http url hostname', () => {
    assert.equal(hostFromRosUrl('http://10.0.0.5:9090'), '10.0.0.5');
  });

  it('falls back on empty or invalid input', () => {
    assert.equal(hostFromRosUrl(''), '192.168.10.17');
    assert.equal(hostFromRosUrl('not-a-url'), '192.168.10.17');
  });
});

describe('buildStreamUrl', () => {
  it('builds a resized web_video_server stream URL', () => {
    assert.equal(
      buildStreamUrl('192.168.10.17'),
      'http://192.168.10.17:8080/stream?topic=%2Fhik_monocular%2Fimage_raw&width=640&height=360&quality=70&client_id=topside-camera',
    );
  });

  it('uses the supplied host without legacy quality options', () => {
    assert.equal(
      buildStreamUrl('robot.local'),
      'http://robot.local:8080/stream?topic=%2Fhik_monocular%2Fimage_raw&width=640&height=360&quality=70&client_id=topside-camera',
    );
  });
});

describe('nextReconnectDelayMs', () => {
  it('uses exponential backoff and caps at 8000', () => {
    assert.equal(nextReconnectDelayMs(0), 1000);
    assert.equal(nextReconnectDelayMs(1), 2000);
    assert.equal(nextReconnectDelayMs(2), 4000);
    assert.equal(nextReconnectDelayMs(3), 8000);
    assert.equal(nextReconnectDelayMs(10), 8000);
  });

  it('treats negative attempt as zero', () => {
    assert.equal(nextReconnectDelayMs(-1), 1000);
  });
});
