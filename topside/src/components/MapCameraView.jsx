import React, { useState } from 'react';
import { Paper, Typography, Box, Button, IconButton, TextField, Tooltip, Chip } from '@mui/material';
import { Map, Video, VideoOff, Settings, MapPin, RefreshCw } from 'lucide-react';

export default function MapCameraView({ odomX = 0, odomY = 0 }) {
  const [viewMode, setViewMode] = useState('MAP'); // 'MAP' | 'CAMERA'
  const [amapKey, setAmapKey] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        bgcolor: 'background.paper',
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative'
      }}
    >
      {/* Header bar with Mode Toggle & Settings */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {viewMode === 'MAP' ? <Map size={20} color="#7cacf8" /> : <Video size={20} color="#7cacf8" />}
          <Typography variant="h6" color="text.primary">
            {viewMode === 'MAP' ? '高德地图定位追踪' : '树莓派摄像机画面'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Map vs Camera Switch Button */}
          <Button
            variant="contained"
            size="small"
            color={viewMode === 'MAP' ? 'primary' : 'secondary'}
            startIcon={viewMode === 'MAP' ? <Video size={16} /> : <Map size={16} />}
            onClick={() => setViewMode(viewMode === 'MAP' ? 'CAMERA' : 'MAP')}
            sx={{ borderRadius: 5 }}
          >
            切换为{viewMode === 'MAP' ? '摄像机画面' : '高德地图'}
          </Button>

          <Tooltip title="高德地图 Key 设置">
            <IconButton
              size="small"
              onClick={() => setShowConfig(!showConfig)}
              sx={{ color: showConfig ? 'primary.main' : 'text.secondary' }}
            >
              <Settings size={18} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* AMap API Key Config Bar */}
      {showConfig && (
        <Box sx={{ p: 1.5, mb: 1.5, bgcolor: 'surface.container', borderRadius: 3, display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="输入高德地图 Web JS API Key (配置后加载真实高德地图)"
            value={amapKey}
            onChange={(e) => setAmapKey(e.target.value)}
            sx={{ bgcolor: 'background.default', borderRadius: 2 }}
          />
          <Button variant="outlined" size="small">
            保存
          </Button>
        </Box>
      )}

      {/* Main Display Area */}
      <Box
        sx={{
          flex: 1,
          minHeight: 260,
          borderRadius: 3,
          overflow: 'hidden',
          position: 'relative',
          bgcolor: 'surface.container',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {viewMode === 'MAP' ? (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              minHeight: 260,
              background: 'radial-gradient(circle at 50% 50%, #1e293b 0%, #0f172a 100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              p: 2
            }}
          >
            {/* Grid Overlay */}
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'radial-gradient(#334155 1px, transparent 1px)',
                backgroundSize: '24px 24px',
                opacity: 0.6
              }}
            />

            {/* Target Car Marker */}
            <Box
              sx={{
                zIndex: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1
              }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  bgcolor: 'rgba(37, 99, 235, 0.2)',
                  border: '2px solid #7cacf8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 20px rgba(124, 172, 248, 0.5)'
                }}
              >
                <MapPin size={26} color="#7cacf8" />
              </Box>
              <Chip
                label={`当前坐标 (X: ${odomX.toFixed(2)}m, Y: ${odomY.toFixed(2)}m)`}
                color="primary"
                size="small"
                sx={{ fontWeight: 600 }}
              />
            </Box>

            {/* Map Status Badge */}
            <Box sx={{ position: 'absolute', bottom: 12, right: 12, zIndex: 3 }}>
              <Chip
                label={amapKey ? '高德地图 API 已载入' : '高德地图 (使用高精里程计坐标定位中)'}
                size="small"
                variant="outlined"
                sx={{ bgcolor: 'rgba(15, 23, 42, 0.8)' }}
              />
            </Box>
          </Box>
        ) : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              minHeight: 260,
              bgcolor: '#090d14',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              p: 3,
              textAlign: 'center'
            }}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'rgba(255, 137, 125, 0.1)',
                border: '1px dashed #ff897d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <VideoOff size={32} color="#ff897d" />
            </Box>

            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
                小车摄像机流信号未建立
              </Typography>
              <Typography variant="body2" color="text.secondary">
                当前小车摄像机硬件功能尚未实现 (预留 WebRTC / RTSP 图像接收端)
              </Typography>
            </Box>

            <Chip
              icon={<RefreshCw size={14} />}
              label="等待摄像机推流广播..."
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
