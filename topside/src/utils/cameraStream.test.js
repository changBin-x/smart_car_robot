/**
 * @file cameraStream.test.js
 * @description 摄像机流 URL 工具函数单元测试（node:test）。
 * @author ChangBin <bin_chang@qq.com>
 * @date 2026-08-04 00:18:37
 * @lastEditors ChangBin <bin_chang@qq.com>
 * @lastEditTime 2026-08-04
 * @copyright Copyright (c) 2026 by ChangBin, All Rights Reserved.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMERA_STREAM_MODE,
  hostFromRosUrl,
  buildStreamUrl,
  buildQualityCtlUrl,
  nextReconnectDelayMs,
} from './cameraStream.js';

describe('CAMERA_STREAM_MODE', () => {
  it('is fixed to single (UVC cannot truly dual-open)', () => {
    assert.equal(CAMERA_STREAM_MODE, 'single');
  });
});

describe('hostFromRosUrl', () => {
  it('parses ws url hostname', () => {
    assert.equal(hostFromRosUrl('ws://192.168.10.17:9090'), '192.168.10.17');
  });

  it('parses http url hostname', () => {
    assert.equal(hostFromRosUrl('http://10.0.0.5:9090'), '10.0.0.5');
  });

  it('falls back on empty input', () => {
    assert.equal(hostFromRosUrl(''), '192.168.10.17');
  });

  it('falls back on invalid input', () => {
    assert.equal(hostFromRosUrl('not-a-url'), '192.168.10.17');
  });

  it('uses custom fallback', () => {
    assert.equal(hostFromRosUrl('', '10.1.1.1'), '10.1.1.1');
  });
});

describe('buildStreamUrl', () => {
  it('low uses 8080 in default single mode', () => {
    assert.equal(
      buildStreamUrl('192.168.10.17', 'low'),
      'http://192.168.10.17:8080/stream'
    );
  });

  it('high uses 8080 in default single mode (no cacheBust)', () => {
    assert.equal(
      buildStreamUrl('192.168.10.17', 'high'),
      'http://192.168.10.17:8080/stream'
    );
  });

  it('high uses 8081 in dual mode', () => {
    assert.equal(
      buildStreamUrl('192.168.10.17', 'high', { mode: 'dual' }),
      'http://192.168.10.17:8081/stream'
    );
  });

  it('low uses 8080 in dual mode', () => {
    assert.equal(
      buildStreamUrl('192.168.10.17', 'low', { mode: 'dual' }),
      'http://192.168.10.17:8080/stream'
    );
  });

  it('high uses 8080 with cache buster in single mode', () => {
    const url = buildStreamUrl('192.168.10.17', 'high', {
      mode: 'single',
      cacheBust: 123,
    });
    assert.equal(url, 'http://192.168.10.17:8080/stream?t=123');
  });

  it('appends cacheBust when provided under default single mode', () => {
    assert.equal(
      buildStreamUrl('192.168.10.17', 'low', { cacheBust: 456 }),
      'http://192.168.10.17:8080/stream?t=456'
    );
  });

  it('does not append cacheBust in dual mode', () => {
    assert.equal(
      buildStreamUrl('192.168.10.17', 'high', {
        mode: 'dual',
        cacheBust: 999,
      }),
      'http://192.168.10.17:8081/stream'
    );
  });
});

describe('buildQualityCtlUrl', () => {
  it('builds ctl url for high', () => {
    assert.equal(
      buildQualityCtlUrl('192.168.10.17', 'high'),
      'http://192.168.10.17:8082/quality?mode=high'
    );
  });

  it('builds ctl url for low', () => {
    assert.equal(
      buildQualityCtlUrl('192.168.10.17', 'low'),
      'http://192.168.10.17:8082/quality?mode=low'
    );
  });

  it('uses custom ctl port', () => {
    assert.equal(
      buildQualityCtlUrl('192.168.10.17', 'high', 9000),
      'http://192.168.10.17:9000/quality?mode=high'
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
