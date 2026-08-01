import React, { useState, useEffect, useRef } from 'react';
import { Paper, Typography, Box, Button, IconButton, TextField, Tooltip, Chip, Alert } from '@mui/material';
import { Map, Video, VideoOff, Settings, MapPin, RefreshCw, Navigation, CheckCircle2, AlertCircle } from 'lucide-react';

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

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  // Direct AMap v2 Script Injector
  const loadAMapV2 = (key, secCode) => {
    return new Promise((resolve, reject) => {
      // 1. MUST set _AMapSecurityConfig BEFORE appending script tag
      if (secCode.trim()) {
        window._AMapSecurityConfig = {
          securityJsCode: secCode.trim()
        };
      } else {
        window._AMapSecurityConfig = {
          securityJsCode: ''
        };
      }

      // If AMap API is already present on window
      if (window.AMap && window.AMap.Map) {
        resolve(window.AMap);
        return;
      }

      // Remove existing script if any
      const existingScript = document.getElementById('amap-v2-sdk');
      if (existingScript) existingScript.remove();

      const script = document.createElement('script');
      script.id = 'amap-v2-sdk';
      script.type = 'text/javascript';
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key.trim())}&plugin=AMap.Scale,AMap.ToolBar,AMap.Marker`;

      script.onload = () => {
        if (window.AMap && window.AMap.Map) {
          resolve(window.AMap);
        } else {
          reject(new Error('高德地图 SDK 加载未找到 AMap 对象'));
        }
      };

      script.onerror = () => {
        reject(new Error('高德 SDK 网络请求失败，请检查 Key 与安全密钥组合是否正确'));
      };

      document.head.appendChild(script);
    });
  };

  // Initialize Map
  useEffect(() => {
    if (viewMode !== 'MAP') return;

    if (!amapKey.trim()) {
      setMapLoaded(false);
      return;
    }

    let isMounted = true;
    setLoadError(null);

    loadAMapV2(amapKey, securityCode)
      .then((AMap) => {
        if (!isMounted || !mapContainerRef.current) return;

        if (mapInstanceRef.current) {
          mapInstanceRef.current.destroy();
        }

        const currentLng = NINGBO_YINZHOU_LNG + odomX * 0.00001;
        const currentLat = NINGBO_YINZHOU_LAT + odomY * 0.00001;

        const map = new AMap.Map(mapContainerRef.current, {
          viewMode: '3D',
          zoom: 15,
          center: [currentLng, currentLat],
          mapStyle: 'amap://styles/darkblue'
        });

        map.addControl(new AMap.Scale());
        map.addControl(new AMap.ToolBar());

        const marker = new AMap.Marker({
          position: new AMap.LngLat(currentLng, currentLat),
          title: 'SmartCar Robot - 宁波市鄞州区'
        });

        map.add(marker);

        mapInstanceRef.current = map;
        markerRef.current = marker;
        setMapLoaded(true);
      })
      .catch((err) => {
        if (isMounted) {
          console.error('AMap load error:', err);
          setLoadError(err.message || '高德 API Key 校验未通过，请确认 Web 平台类型 Key');
          setMapLoaded(false);
        }
      });

    return () => {
      isMounted = false;
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
      markerRef.current.setPosition(new window.AMap.LngLat(currentLng, currentLat));
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
        minHeight: 440,
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

          <Tooltip title="高德 API Key 与安全密钥配置">
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

      {/* AMap Key Config Panel */}
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
            高德 Web 端(JS API) Key 与安全密钥 (高德开放平台控制台需申请 Web 端应用)
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="高德 Web API Key"
              placeholder="请输入 Web 端 Key"
              value={amapKey}
              onChange={(e) => setAmapKey(e.target.value)}
              sx={{ bgcolor: 'background.default', borderRadius: 2, flex: 2, minWidth: 200 }}
            />
            <TextField
              size="small"
              label="安全密钥 securityJsCode"
              placeholder="请输入安全密钥 (选填)"
              value={securityCode}
              onChange={(e) => setSecurityCode(e.target.value)}
              sx={{ bgcolor: 'background.default', borderRadius: 2, flex: 1, minWidth: 160 }}
            />
            <Button variant="contained" size="small" onClick={handleSaveConfig} startIcon={<CheckCircle2 size={16} />}>
              保存并连接
            </Button>
          </Box>
        </Box>
      )}

      {loadError && (
        <Alert severity="warning" icon={<AlertCircle size={18} />} sx={{ mb: 1.5, borderRadius: 2 }} onClose={() => setLoadError(null)}>
          {loadError}
        </Alert>
      )}

      {/* Main Container */}
      <Box
        sx={{
          flex: 1,
          width: '100%',
          minHeight: 360,
          borderRadius: 3,
          overflow: 'hidden',
          position: 'relative',
          bgcolor: 'surface.container'
        }}
      >
        {viewMode === 'MAP' ? (
          <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
            {/* Real AMap SDK Container */}
            <Box
              ref={mapContainerRef}
              sx={{
                width: '100%',
                height: '100%',
                display: mapLoaded ? 'block' : 'none'
              }}
            />

            {/* High-definition Vector Interactive Map Centered at 宁波市鄞州区 */}
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
                {/* Map Grid Pattern */}
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
                  <line x1="0" y1="180" x2="800" y2="180" stroke="#7cacf8" strokeWidth="3" strokeDasharray="8 4" />
                  <line x1="350" y1="0" x2="350" y2="400" stroke="#7cacf8" strokeWidth="3" strokeDasharray="8 4" />
                  <line x1="0" y1="320" x2="800" y2="280" stroke="#4edea3" strokeWidth="2" />
                  <circle cx="400" cy="200" r="90" fill="none" stroke="#7cacf8" strokeWidth="1" strokeDasharray="4 4" />
                </svg>

                {/* Location Chips */}
                <Box sx={{ position: 'absolute', top: 20, left: 20, zIndex: 3, display: 'flex', gap: 1 }}>
                  <Chip
                    icon={<Navigation size={14} />}
                    label="浙江省宁波市鄞州区 (29.8082°N, 121.5497°E)"
                    color="primary"
                    size="small"
                  />
                  <Chip label="地图就绪模式" size="small" variant="outlined" />
                </Box>

                {/* Center Car Marker */}
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
                    label={`SmartCar 鄞州区中心 (X: ${odomX.toFixed(2)}m, Y: ${odomY.toFixed(2)}m)`}
                    color="primary"
                    size="small"
                    sx={{ fontWeight: 600 }}
                  />
                </Box>

                <Box sx={{ position: 'absolute', bottom: 12, right: 12, zIndex: 3 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ bgcolor: 'rgba(15, 23, 42, 0.8)', p: 0.8, borderRadius: 1.5 }}>
                    点击右上角⚙️图标可随时校验并载入高德 JS API 离线/在线瓦片全图层
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
