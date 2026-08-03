/**
 * @Author: ChangBin bin_chang@qq.com
 * @Date: 2026-08-04 00:49:20
 * @LastEditors: ChangBin bin_chang@qq.com
 * @LastEditTime: 2026-08-04
 * @Copyright (c) 2026 by ChangBin, All Rights Reserved.
 * @Description: 树莓派 MJPEG 摄像机面板，支持低延迟/高清切换与断流重连。
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Paper,
  Typography,
  Box,
  Button,
  ButtonGroup,
  Chip,
} from '@mui/material';
import {
  Video,
  VideoOff,
  RefreshCw,
} from 'lucide-react';
import {
  CAMERA_STREAM_MODE,
  buildStreamUrl,
  buildQualityCtlUrl,
  nextReconnectDelayMs,
} from '../utils/cameraStream';

const DEFAULT_CAMERA_HOST = '192.168.10.17';

/**
 * 树莓派 MJPEG 实时画面面板。
 *
 * @param {object} props 组件属性。
 * @param {string} [props.cameraHost='192.168.10.17'] 摄像机推流主机名或 IP。
 * @returns {JSX.Element} 摄像机画面面板。
 */
export default function CameraView({
  cameraHost = DEFAULT_CAMERA_HOST,
}) {
  /** @type {'low'|'high'} 画质档位，默认低延迟。 */
  const [quality, setQuality] = useState('low');
  /** 当前 MJPEG 帧是否成功加载。 */
  const [streamOk, setStreamOk] = useState(false);
  /** 断流后的重连尝试次数（用于指数退避）。 */
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  /** single 模式下刷新 img src 的缓存破坏参数。 */
  const [cacheBust, setCacheBust] = useState(() => Date.now());

  const reconnectTimerRef = useRef(null);

  const streamUrl = buildStreamUrl(cameraHost, quality, {
    mode: CAMERA_STREAM_MODE,
    cacheBust,
  });

  /** 清除待执行的重连定时器。 */
  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current != null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearReconnectTimer(), [clearReconnectTimer]);

  /**
   * MJPEG 帧加载成功：标记正常并重置退避计数。
   */
  const handleStreamLoad = useCallback(() => {
    setStreamOk(true);
    setReconnectAttempt(0);
    clearReconnectTimer();
  }, [clearReconnectTimer]);

  /**
   * MJPEG 断流：显示提示，并按指数退避刷新 cacheBust 重连。
   */
  const handleStreamError = useCallback(() => {
    setStreamOk(false);
    clearReconnectTimer();
    const delayMs = nextReconnectDelayMs(reconnectAttempt);
    reconnectTimerRef.current = setTimeout(() => {
      setReconnectAttempt((prev) => prev + 1);
      setCacheBust(Date.now());
    }, delayMs);
  }, [clearReconnectTimer, reconnectAttempt]);

  /**
   * 切换低延迟 / 高清档位。
   * single 模式先请求质量控制接口，再刷新 cacheBust 以重新拉流。
   *
   * @param {'low'|'high'} nextQuality 目标画质。
   */
  const handleQualityChange = useCallback(
    async (nextQuality) => {
      if (nextQuality === quality) {
        return;
      }
      clearReconnectTimer();
      setQuality(nextQuality);
      setStreamOk(false);
      setReconnectAttempt(0);

      if (CAMERA_STREAM_MODE === 'single') {
        try {
          await fetch(buildQualityCtlUrl(cameraHost, nextQuality));
        } catch (err) {
          console.warn('camera quality ctl failed:', err);
        }
        setCacheBust(Date.now());
      }
    },
    [cameraHost, clearReconnectTimer, quality],
  );

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        bgcolor: 'background.paper',
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minHeight: { xs: 320, md: 380 },
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1.5,
          flexShrink: 0,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Video size={20} color="#7cacf8" />
          <Typography variant="h6" color="text.primary">
            树莓派摄像机画面
          </Typography>
          {streamOk && (
            <Chip
              label={quality === 'low' ? '低延迟' : '高清'}
              color="success"
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.7rem' }}
            />
          )}
        </Box>

        <ButtonGroup size="small" variant="outlined" sx={{ borderRadius: 5 }}>
          <Button
            variant={quality === 'low' ? 'contained' : 'outlined'}
            onClick={() => handleQualityChange('low')}
            sx={{ borderRadius: '20px 0 0 20px' }}
          >
            低延迟
          </Button>
          <Button
            variant={quality === 'high' ? 'contained' : 'outlined'}
            onClick={() => handleQualityChange('high')}
            sx={{ borderRadius: '0 20px 20px 0' }}
          >
            高清
          </Button>
        </ButtonGroup>
      </Box>

      <Box
        sx={{
          flex: 1,
          width: '100%',
          borderRadius: 3,
          overflow: 'hidden',
          position: 'relative',
          bgcolor: '#090d14',
          minHeight: 260,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box
          component="img"
          src={streamUrl}
          alt="camera"
          onLoad={handleStreamLoad}
          onError={handleStreamError}
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
            bgcolor: '#000',
          }}
        />

        {!streamOk && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              bgcolor: 'rgba(9, 13, 20, 0.85)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              p: 3,
              textAlign: 'center',
            }}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'rgba(255,137,125,0.1)',
                border: '1px dashed #ff897d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <VideoOff size={32} color="#ff897d" />
            </Box>
            <Box>
              <Typography
                variant="h6"
                sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}
              >
                摄像机流中断
              </Typography>
              <Typography variant="body2" color="text.secondary">
                正在重连 {cameraHost}（{quality === 'low' ? '低延迟' : '高清'}）…
              </Typography>
            </Box>
            <Chip
              icon={<RefreshCw size={14} />}
              label={`重连尝试 #${reconnectAttempt + 1}`}
              size="small"
              color="warning"
              variant="outlined"
            />
          </Box>
        )}
      </Box>
    </Paper>
  );
}
