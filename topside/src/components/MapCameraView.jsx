import React, { useState, useEffect, useRef } from 'react';
import { Paper, Typography, Box, Button, IconButton, TextField, Tooltip, Chip, Alert } from '@mui/material';
import {
  Map,
  Video,
  VideoOff,
  Settings,
  MapPin,
  RefreshCw,
  Navigation,
  CheckCircle2,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  Target
} from 'lucide-react';

// Default Coordinates: 宁波市鄞州区
const NINGBO_YINZHOU_LNG = 121.5497;
const NINGBO_YINZHOU_LAT = 29.8082;

const DEFAULT_AMAP_KEY = 'e5d9a357843cb149b80dcc0f9e126b24';
const DEFAULT_AMAP_SECURITY = '3a7ab9b46a757f8e366cb63027813ea8';

export default function MapCameraView({ odomX = 0, odomY = 0 }) {
  const [viewMode, setViewMode] = useState('MAP');
  const [amapKey, setAmapKey] = useState(() => localStorage.getItem('smartcar_amap_key') || DEFAULT_AMAP_KEY);
  const [securityCode, setSecurityCode] = useState(() => localStorage.getItem('smartcar_amap_security') || DEFAULT_AMAP_SECURITY);
  const [showConfig, setShowConfig] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [zoomLevel, setZoomLevel] = useState(15);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  // Safely calculate Lng / Lat numbers
  const getSafeCoordinates = () => {
    const safeX = typeof odomX === 'number' && !isNaN(odomX) ? odomX : 0;
    const safeY = typeof odomY === 'number' && !isNaN(odomY) ? odomY : 0;
    const lng = Number((NINGBO_YINZHOU_LNG + safeX * 0.00001).toFixed(6));
    const lat = Number((NINGBO_YINZHOU_LAT + safeY * 0.00001).toFixed(6));
    return [lng, lat];
  };

  // Helper to load AMap SDK dynamically if not present
  const ensureAMapLoaded = (key, secCode) => {
    return new Promise((resolve, reject) => {
      window._AMapSecurityConfig = {
        securityJsCode: secCode.trim() || DEFAULT_AMAP_SECURITY
      };

      if (window.AMap && window.AMap.Map) {
        resolve(window.AMap);
        return;
      }

      const scriptId = 'amap-v2-sdk-script';
      const existing = document.getElementById(scriptId);
      if (existing) existing.remove();

      const script = document.createElement('script');
      script.id = scriptId;
      script.type = 'text/javascript';
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key.trim() || DEFAULT_AMAP_KEY)}&plugin=AMap.Scale,AMap.ToolBar`;

      script.onload = () => {
        if (window.AMap && window.AMap.Map) {
          resolve(window.AMap);
        } else {
          reject(new Error('高德地图 SDK 加载失败'));
        }
      };

      script.onerror = () => {
        reject(new Error('高德 SDK 网络加载失败'));
      };

      document.head.appendChild(script);
    });
  };

  // Initialize Map
  useEffect(() => {
    if (viewMode !== 'MAP') return;

    let isMounted = true;
    setLoadError(null);

    const timer = setTimeout(() => {
      ensureAMapLoaded(amapKey, securityCode)
        .then((AMap) => {
          if (!isMounted || !mapContainerRef.current) return;

          const [lng, lat] = getSafeCoordinates();

          if (mapInstanceRef.current) {
            try {
              mapInstanceRef.current.destroy();
            } catch (e) {}
          }

          // Create Map Instance safely
          const map = new AMap.Map(mapContainerRef.current, {
            viewMode: '3D',
            zoom: zoomLevel,
            zooms: [3, 20],
            center: [lng, lat],
            mapStyle: 'amap://styles/darkblue',
            scrollWheel: true,
            dragEnable: true,
            zoomEnable: true,
            touchZoom: true,
            doubleClickZoom: true,
            keyboardEnable: true
          });

          if (AMap.Scale) map.addControl(new AMap.Scale());
          if (AMap.ToolBar) map.addControl(new AMap.ToolBar());

          map.on('zoomchange', () => {
            if (isMounted && map) {
              setZoomLevel(Math.round(map.getZoom()));
            }
          });

          // Marker creation without invalid offset
          const marker = new AMap.Marker({
            position: [lng, lat],
            title: 'SmartCar Robot - 宁波市鄞州区',
            anchor: 'bottom-center'
          });

          map.add(marker);

          mapInstanceRef.current = map;
          markerRef.current = marker;
          setMapLoaded(true);
        })
        .catch((err) => {
          if (isMounted) {
            console.error('AMap initialization warning:', err);
            setMapLoaded(false);
          }
        });
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.destroy();
        } catch (e) {}
        mapInstanceRef.current = null;
      }
    };
  }, [amapKey, securityCode, viewMode]);

  // Update marker position dynamically on Odometry updates
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current && window.AMap) {
      const [lng, lat] = getSafeCoordinates();
      markerRef.current.setPosition([lng, lat]);
    }
  }, [odomX, odomY]);

  // Zoom Controls Handlers
  const handleZoomIn = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomIn();
    } else {
      setZoomLevel((prev) => Math.min(prev + 1, 20));
    }
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomOut();
    } else {
      setZoomLevel((prev) => Math.max(prev - 1, 3));
    }
  };

  const handleResetCenter = () => {
    const [lng, lat] = getSafeCoordinates();
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setZoomAndCenter(15, [lng, lat]);
    }
    setZoomLevel(15);
  };

  const handleSaveConfig = () => {
    localStorage.setItem('smartcar_amap_key', amapKey.trim());
    localStorage.setItem('smartcar_amap_security', securityCode.trim());
    setShowConfig(false);
  };

  const [lng, lat] = getSafeCoordinates();

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
            高德 Web 端 (JS API) Key 与安全密钥配置
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="高德 Web API Key"
              placeholder="e5d9a357843cb149b80dcc0f9e126b24"
              value={amapKey}
              onChange={(e) => setAmapKey(e.target.value)}
              sx={{ bgcolor: 'background.default', borderRadius: 2, flex: 2, minWidth: 200 }}
            />
            <TextField
              size="small"
              label="安全密钥 securityJsCode"
              placeholder="3a7ab9b46a757f8e366cb63027813ea8"
              value={securityCode}
              onChange={(e) => setSecurityCode(e.target.value)}
              sx={{ bgcolor: 'background.default', borderRadius: 2, flex: 1, minWidth: 160 }}
            />
            <Button variant="contained" size="small" onClick={handleSaveConfig} startIcon={<CheckCircle2 size={16} />}>
              保存并重载
            </Button>
          </Box>
        </Box>
      )}

      {/* Main Map Container */}
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
            {/* Real AMap Container */}
            <Box
              ref={mapContainerRef}
              id="amap-container-element"
              style={{
                width: '100%',
                height: '100%',
                minHeight: '360px',
                position: 'relative',
                display: mapLoaded ? 'block' : 'none'
              }}
            />

            {/* Interactive Vector Map Centered at 宁波市鄞州区 */}
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
                  p: 2,
                  overflow: 'hidden'
                }}
              >
                {/* Map Grid Pattern */}
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage:
                      'linear-gradient(rgba(124, 172, 248, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(124, 172, 248, 0.08) 1px, transparent 1px)',
                    backgroundSize: `${40 * (zoomLevel / 15)}px ${40 * (zoomLevel / 15)}px`,
                    opacity: 0.8,
                    transition: 'background-size 0.3s ease'
                  }}
                />

                {/* Road Lines */}
                <svg
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0.4,
                    transform: `scale(${zoomLevel / 15})`,
                    transition: 'transform 0.3s ease'
                  }}
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
                    label={`浙江省宁波市鄞州区 (${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E)`}
                    color="primary"
                    size="small"
                  />
                  <Chip label="地图加载就绪" size="small" variant="outlined" />
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
              </Box>
            )}

            {/* Floating Zoom & Location Controls Bar */}
            <Box
              sx={{
                position: 'absolute',
                right: 16,
                bottom: 16,
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                bgcolor: 'rgba(15, 23, 42, 0.85)',
                p: 0.8,
                borderRadius: 3,
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              <Tooltip title="放大地图 (Zoom In)">
                <IconButton size="small" onClick={handleZoomIn} sx={{ color: 'text.primary' }}>
                  <ZoomIn size={18} />
                </IconButton>
              </Tooltip>

              <Chip
                label={`${zoomLevel}x`}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  bgcolor: 'surface.container',
                  color: 'primary.light'
                }}
              />

              <Tooltip title="缩小地图 (Zoom Out)">
                <IconButton size="small" onClick={handleZoomOut} sx={{ color: 'text.primary' }}>
                  <ZoomOut size={18} />
                </IconButton>
              </Tooltip>

              <Tooltip title="居中鄞州区定位">
                <IconButton size="small" onClick={handleResetCenter} sx={{ color: 'status.ok' }}>
                  <Target size={18} />
                </IconButton>
              </Tooltip>
            </Box>
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
