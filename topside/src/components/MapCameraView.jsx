import React, { useState, useEffect, useRef } from 'react';
import AMapLoader from '@amap/amap-jsapi-loader';
import { Paper, Typography, Box, Button, IconButton, TextField, Tooltip, Chip, Alert } from '@mui/material';
import { Map, Video, VideoOff, Settings, MapPin, RefreshCw, Navigation, CheckCircle2 } from 'lucide-react';

// Default Coordinates: 宁波市鄞州区
const NINGBO_YINZHOU_LNG = 121.5497;
const NINGBO_YINZHOU_LAT = 29.8082;

export default function MapCameraView({ odomX = 0, odomY = 0 }) {
  const [viewMode, setViewMode] = useState('MAP');
  const [amapKey, setAmapKey] = useState(() => localStorage.getItem('smartcar_amap_key') || '');
  const [securityCode, setSecurityCode] = useState(() => localStorage.getItem('smartcar_amap_security') || '');
  const [showConfig, setShowConfig] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  // Initialize or re-initialize AMap JS API v2
  useEffect(() => {
    if (viewMode !== 'MAP') return;

    if (!amapKey.trim()) {
      setMapLoaded(false);
      return;
    }

    // Set AMap Security Config as required by JS API v2
    if (securityCode.trim()) {
      window._AMapSecurityConfig = {
        securityJsCode: securityCode.trim()
      };
    } else {
      window._AMapSecurityConfig = {
        securityJsCode: ''
      };
    }

    setLoadError(null);

    AMapLoader.load({
      key: amapKey.trim(),
      version: '2.0',
      plugins: ['AMap.Scale', 'AMap.ToolBar', 'AMap.Marker', 'AMap.Polyline']
    })
      .then((AMap) => {
        if (!mapRef.current) return;

        // Destroy previous instance if re-initializing
        if (mapInstanceRef.current) {
          mapInstanceRef.current.destroy();
        }

        const currentLng = NINGBO_YINZHOU_LNG + odomX * 0.00001;
        const currentLat = NINGBO_YINZHOU_LAT + odomY * 0.00001;

        const map = new AMap.Map(mapRef.current, {
          viewMode: '3D',
          zoom: 15,
          center: [currentLng, currentLat],
          mapStyle: 'amap://styles/darkblue'
        });

        // Add Scale and ToolBar controls
        map.addControl(new AMap.Scale());
        map.addControl(new AMap.ToolBar());

        // Create Car Location Marker
        const marker = new AMap.Marker({
          position: new AMap.LngLat(currentLng, currentLat),
          title: 'SmartCar Robot - 宁波市鄞州区',
          anchor: 'center'
        });

        map.add(marker);

        mapInstanceRef.current = map;
        markerRef.current = marker;
        setMapLoaded(true);
      })
      .catch((e) => {
        console.error('AMap Loader Error:', e);
        setLoadError(e?.message || '高德地图加载失败，请检查 Key 与安全密钥');
        setMapLoaded(false);
      });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [amapKey, securityCode, viewMode]);

  // Update marker position dynamically on Odometry updates
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current && window.AMap) {
      const currentLng = NINGBO_YINZHOU_LNG + odomX * 0.00001;
      const currentLat = NINGBO_YINZHOU_LAT + odomY * 0.00001;
      const newPos = new window.AMap.LngLat(currentLng, currentLat);
      markerRef.current.setPosition(newPos);
    }
  }, [odomX, odomY]);

  const handleSaveConfig = () => {
    localStorage.setItem('smartcar_amap_key', amapKey.trim());
    localStorage.setItem('smartcar_amap_security', securityCode.trim());
    setShowConfig(false);
  };

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
        width: '100%',
        minHeight: 380,
        position: 'relative'
      }}
    >
      {/* Header bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {viewMode === 'MAP' ? <Map size={20} color="#7cacf8" /> : <Video size={20} color="#7cacf8" />}
          <Typography variant="h6" color="text.primary">
            {viewMode === 'MAP' ? '高德地图定位追踪 (宁波市鄞州区)' : '树莓派摄像机画面'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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

          <Tooltip title="高德 Web JS API v2 密钥配置">
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

      {/* AMap v2 API Key & Security Code Config Drawer */}
      {showConfig && (
        <Box
          sx={{
            p: 2,
            mb: 1.5,
            bgcolor: 'surface.container',
            borderRadius: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            border: '1px solid rgba(124, 172, 248, 0.2)'
          }}
        >
          <Typography variant="caption" color="text.secondary">
            高德 JS API v2 安全密钥配置 (支持填写 Key 与安全密钥 securityJsCode)
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="高德 Key"
              placeholder="如 e5fa5a257a4cb... (Web 端 API Key)"
              value={amapKey}
              onChange={(e) => setAmapKey(e.target.value)}
              sx={{ bgcolor: 'background.default', borderRadius: 2, flex: 2, minWidth: 200 }}
            />
            <TextField
              size="small"
              label="安全密钥 (securityJsCode)"
              placeholder="高德控制台申请的安全密钥"
              value={securityCode}
              onChange={(e) => setSecurityCode(e.target.value)}
              sx={{ bgcolor: 'background.default', borderRadius: 2, flex: 1, minWidth: 160 }}
            />
            <Button variant="contained" size="small" onClick={handleSaveConfig} startIcon={<CheckCircle2 size={16} />}>
              保存并连接地图
            </Button>
          </Box>
        </Box>
      )}

      {loadError && (
        <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 2 }} onClose={() => setLoadError(null)}>
          {loadError}
        </Alert>
      )}

      {/* Main Display Box */}
      <Box
        sx={{
          flex: 1,
          width: '100%',
          minHeight: 300,
          borderRadius: 3,
          overflow: 'hidden',
          position: 'relative',
          bgcolor: 'surface.container'
        }}
      >
        {viewMode === 'MAP' ? (
          <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
            {/* Real AMap Container Element */}
            <Box
              ref={mapRef}
              id="amap-map-container"
              sx={{
                width: '100%',
                height: '100%',
                display: mapLoaded ? 'block' : 'none'
              }}
            />

            {/* Default Interactive Vector Map Centered on 宁波市鄞州区 (Shown when Key is not entered or loading) */}
            {!mapLoaded && (
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  background: 'radial-gradient(circle at 50% 50%, #172133 0%, #0d131f 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  p: 2
                }}
              >
                {/* Vector Map Grid Lines */}
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage:
                      'linear-gradient(rgba(124, 172, 248, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(124, 172, 248, 0.08) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    opacity: 0.8
                  }}
                />

                {/* Simulated Road Lines */}
                <svg
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.4 }}
                  viewBox="0 0 800 400"
                >
                  {/* 世纪大道 */}
                  <line x1="0" y1="180" x2="800" y2="180" stroke="#7cacf8" strokeWidth="3" strokeDasharray="8 4" />
                  {/* 南部商务区干道 */}
                  <line x1="350" y1="0" x2="350" y2="400" stroke="#7cacf8" strokeWidth="3" strokeDasharray="8 4" />
                  {/* 鄞州大道 */}
                  <line x1="0" y1="320" x2="800" y2="280" stroke="#4edea3" strokeWidth="2" />
                  {/* 鄞州区政府中心圈 */}
                  <circle cx="400" cy="200" r="90" fill="none" stroke="#7cacf8" strokeWidth="1" strokeDasharray="4 4" />
                </svg>

                {/* Ningbo Yinzhou Location Label Chips */}
                <Box sx={{ position: 'absolute', top: 20, left: 20, zIndex: 3, display: 'flex', gap: 1 }}>
                  <Chip
                    icon={<Navigation size={14} />}
                    label="浙江省宁波市鄞州区 (29.8082°N, 121.5497°E)"
                    color="primary"
                    size="small"
                  />
                  <Chip label="默认底图模式" size="small" variant="outlined" />
                </Box>

                {/* Car Location Marker at Center */}
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
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      bgcolor: 'rgba(37, 99, 235, 0.25)',
                      border: '2px solid #7cacf8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 24px rgba(124, 172, 248, 0.6)'
                    }}
                  >
                    <MapPin size={28} color="#7cacf8" />
                  </Box>
                  <Chip
                    label={`SmartCar 实时位置 (X: ${odomX.toFixed(2)}m, Y: ${odomY.toFixed(2)}m)`}
                    color="primary"
                    size="small"
                    sx={{ fontWeight: 600 }}
                  />
                </Box>

                <Box sx={{ position: 'absolute', bottom: 12, right: 12, zIndex: 3 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ bgcolor: 'rgba(15, 23, 42, 0.8)', p: 0.5, borderRadius: 1 }}>
                    右上方设置图标填入高德 Key 可开启官方卫星/矢量全要素图层
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        ) : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
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
