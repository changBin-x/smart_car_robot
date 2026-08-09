/**
 * @Author: ChangBin bin_chang@qq.com
 * @Date: 2026-08-10
 * @LastEditors: ChangBin bin_chang@qq.com
 * @LastEditTime: 2026-08-10
 * @Copyright (c) 2026 by ChangBin, All Rights Reserved.
 * @Description: 使用 web_video_server 显示树莓派单路相机预览并处理断流重连。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Chip, Paper, Typography } from '@mui/material';
import { RefreshCw, Video, VideoOff } from 'lucide-react';
import { buildStreamUrl, nextReconnectDelayMs } from '../utils/cameraStream';

/** 未配置时使用的树莓派默认地址。 */
const DEFAULT_CAMERA_HOST = '192.168.10.17';

/**
 * 树莓派单路 MJPEG 实时画面面板。
 *
 * @param {object} props 组件属性。
 * @param {string} [props.cameraHost='192.168.10.17'] 相机预览主机名或 IP。
 * @returns {JSX.Element} 摄像机画面面板。
 */
export default function CameraView({
  cameraHost = DEFAULT_CAMERA_HOST,
}) {
  /** 当前 MJPEG 帧是否成功加载。 */
  const [streamOk, setStreamOk] = useState(false);
  /** 断流后的重连尝试次数，用于指数退避。 */
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  /** 刷新 img URL 的缓存破坏参数。 */
  const [cacheBust, setCacheBust] = useState(() => Date.now());
  /** 待执行的重连定时器。 */
  const reconnectTimerRef = useRef(null);

  const streamUrl = `${buildStreamUrl(cameraHost)}&t=${cacheBust}`;

  /** 清除待执行的重连定时器。 */
  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current != null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearReconnectTimer(), [clearReconnectTimer]);

  /** MJPEG 帧加载成功时重置退避计数。 */
  const handleStreamLoad = useCallback(() => {
    setStreamOk(true);
    setReconnectAttempt(0);
    clearReconnectTimer();
  }, [clearReconnectTimer]);

  /** MJPEG 断流时按指数退避刷新 URL 并重连。 */
  const handleStreamError = useCallback(() => {
    setStreamOk(false);
    clearReconnectTimer();
    const delayMs = nextReconnectDelayMs(reconnectAttempt);
    reconnectTimerRef.current = setTimeout(() => {
      setReconnectAttempt((previousAttempt) => previousAttempt + 1);
      setCacheBust(Date.now());
    }, delayMs);
  }, [clearReconnectTimer, reconnectAttempt]);

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
            树莓派摄像机预览（640×360）
          </Typography>
          {streamOk && (
            <Chip
              label="已连接"
              color="success"
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.7rem' }}
            />
          )}
        </Box>
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
          alt="hik monocular camera"
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
                正在重连 {cameraHost}…
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
