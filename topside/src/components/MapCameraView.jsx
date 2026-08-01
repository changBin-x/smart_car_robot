import React, { useState, useEffect, useRef } from 'react';
import { Paper, Typography, Box, Button, IconButton, TextField, Tooltip, Chip } from '@mui/material';
import {
  Map,
  Video,
  VideoOff,
  Settings,
  MapPin,
  RefreshCw,
  Navigation,
  CheckCircle2,
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
  const [amapKey] = useState(DEFAULT_AMAP_KEY);
  const [securityCode] = useState(DEFAULT_AMAP_SECURITY);
  const [showConfig, setShowConfig] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(15);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const initAttemptedRef = useRef(false);

  // Safely calculate Lng / Lat numbers
  const getSafeCoordinates = () => {
    const safeX = typeof odomX === 'number' && !isNaN(odomX) ? odomX : 0;
    const safeY = typeof odomY === 'number' && !isNaN(odomY) ? odomY : 0;
    const lng = Number((NINGBO_YINZHOU_LNG + safeX * 0.00001).toFixed(6));
    const lat = Number((NINGBO_YINZHOU_LAT + safeY * 0.00001).toFixed(6));
    return [lng, lat];
  };

  // Initialize AMap — container must already be in DOM & visible
  const initMap = () => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // already initialized

    const AMap = window.AMap;
    if (!AMap || !AMap.Map) {
      setMapError('高德地图 SDK 尚未加载，请刷新页面。');
      return;
    }

    const [lng, lat] = getSafeCoordinates();

    try {
      const map = new AMap.Map(mapContainerRef.current, {
        viewMode: '2D',
        zoom: 15,
        zooms: [3, 20],
        center: [lng, lat],
        mapStyle: 'amap://styles/darkblue',
        scrollWheel: true,
        dragEnable: true,
        zoomEnable: true,
        touchZoom: true,
        doubleClickZoom: true,
        keyboardEnable: true,
        resizeEnable: true,
      });

      // Add controls when available
      AMap.plugin(['AMap.Scale', 'AMap.ToolBar'], () => {
        map.addControl(new AMap.Scale());
        map.addControl(new AMap.ToolBar({ position: 'LB' }));
      });

      map.on('zoomchange', () => {
        setZoomLevel(Math.round(map.getZoom()));
      });

      map.on('complete', () => {
        setMapLoaded(true);
        setMapError(null);
      });

      // Marker
      const marker = new AMap.Marker({
        position: new AMap.LngLat(lng, lat),
        title: 'SmartCar Robot',
        anchor: 'bottom-center',
      });
      map.add(marker);

      mapInstanceRef.current = map;
      markerRef.current = marker;
    } catch (err) {
      console.error('AMap init error:', err);
      setMapError(`地图初始化失败: ${err.message}`);
    }
  };

  // Wait for AMap SDK to be ready after component mounts
  useEffect(() => {
    if (viewMode !== 'MAP') return;
    if (initAttemptedRef.current) return;
    initAttemptedRef.current = true;

    const tryInit = () => {
      if (window.AMap && window.AMap.Map) {
        initMap();
      } else {
        // SDK not yet loaded — poll until ready (max ~5s)
        let attempts = 0;
        const poll = setInterval(() => {
          attempts++;
          if (window.AMap && window.AMap.Map) {
            clearInterval(poll);
            initMap();
          } else if (attempts > 50) {
            clearInterval(poll);
            setMapError('高德地图 SDK 加载超时，请检查网络连接或刷新页面。');
          }
        }, 100);
      }
    };

    // Slight delay so React has finished mounting the DOM element
    const timer = setTimeout(tryInit, 200);
    return () => clearTimeout(timer);
  }, [viewMode]);

  // Destroy map when switching away from map view
  useEffect(() => {
    if (viewMode !== 'MAP' && mapInstanceRef.current) {
      try { mapInstanceRef.current.destroy(); } catch (_) {}
      mapInstanceRef.current = null;
      markerRef.current = null;
      initAttemptedRef.current = false;
      setMapLoaded(false);
    }
  }, [viewMode]);

  // Update marker position when odometry changes
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current && window.AMap) {
      const [lng, lat] = getSafeCoordinates();
      markerRef.current.setPosition(new window.AMap.LngLat(lng, lat));
    }
  }, [odomX, odomY]);

  const handleZoomIn = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
  };

  const handleResetCenter = () => {
    const [lng, lat] = getSafeCoordinates();
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setZoomAndCenter(15, [lng, lat]);
    }
    setZoomLevel(15);
  };

  const [lng, lat] = getSafeCoordinates();

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
        minHeight: 440,
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      {/* Header bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {viewMode === 'MAP' ? <Map size={20} color="#7cacf8" /> : <Video size={20} color="#7cacf8" />}
          <Typography variant="h6" color="text.primary">
            {viewMode === 'MAP' ? '高德地图定位追踪' : '树莓派摄像机画面'}
          </Typography>
          {mapLoaded && viewMode === 'MAP' && (
            <Chip
              icon={<Navigation size={12} />}
              label={`${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`}
              color="primary"
              size="small"
              sx={{ fontSize: '0.7rem' }}
            />
          )}
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
            {viewMode === 'MAP' ? '切换摄像机' : '切换地图'}
          </Button>

          <Tooltip title="高德 API Key 配置">
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

      {/* Config Panel */}
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
            border: '1px solid rgba(124, 172, 248, 0.2)',
            flexShrink: 0,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            当前高德 API Key（已预置，如需修改请刷新页面生效）
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip label={`Key: ${amapKey.substring(0, 8)}...`} size="small" color="primary" variant="outlined" />
            <Chip label={`Security: ${securityCode.substring(0, 8)}...`} size="small" color="success" variant="outlined" />
            <Button
              variant="outlined"
              size="small"
              startIcon={<CheckCircle2 size={14} />}
              onClick={() => { setShowConfig(false); }}
            >
              确认
            </Button>
          </Box>
        </Box>
      )}

      {/* Error Banner */}
      {mapError && viewMode === 'MAP' && (
        <Box
          sx={{
            p: 1.5,
            mb: 1,
            bgcolor: 'rgba(255, 100, 100, 0.1)',
            border: '1px solid rgba(255, 100, 100, 0.3)',
            borderRadius: 2,
            flexShrink: 0,
          }}
        >
          <Typography variant="caption" color="error.light">
            ⚠️ {mapError}
          </Typography>
        </Box>
      )}

      {/* Main Map / Camera Container */}
      <Box
        sx={{
          flex: 1,
          width: '100%',
          borderRadius: 3,
          overflow: 'hidden',
          position: 'relative',
          bgcolor: '#0a0f1c',
          minHeight: 300,
        }}
      >
        {/* ── AMap Container ── always in DOM when viewMode === MAP, always block */}
        <Box
          ref={mapContainerRef}
          id="amap-container-element"
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            // CRITICAL: never use display:none — AMap needs a visible container
            display: viewMode === 'MAP' ? 'block' : 'none',
          }}
        />

        {/* Loading overlay — shown while map is mounting */}
        {viewMode === 'MAP' && !mapLoaded && !mapError && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at 50% 50%, #172133 0%, #0d131f 100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
              pointerEvents: 'none',
            }}
          >
            {/* Grid Pattern */}
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                backgroundImage:
                  'linear-gradient(rgba(124,172,248,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(124,172,248,0.07) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
            <Box sx={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  bgcolor: 'rgba(37,99,235,0.2)',
                  border: '2px solid #7cacf8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 24px rgba(124,172,248,0.5)',
                  animation: 'pulse 2s infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { boxShadow: '0 0 24px rgba(124,172,248,0.5)' },
                    '50%': { boxShadow: '0 0 40px rgba(124,172,248,0.9)' },
                  },
                }}
              >
                <MapPin size={26} color="#7cacf8" />
              </Box>
              <Typography variant="body2" color="text.secondary">
                宁波市鄞州区地图加载中…
              </Typography>
              <Chip
                label={`${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`}
                color="primary"
                size="small"
                variant="outlined"
              />
            </Box>
          </Box>
        )}

        {/* Camera placeholder */}
        {viewMode === 'CAMERA' && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              bgcolor: '#090d14',
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

        {/* Floating Zoom & Location Controls */}
        {viewMode === 'MAP' && (
          <Box
            sx={{
              position: 'absolute',
              right: 12,
              bottom: 12,
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              bgcolor: 'rgba(15,23,42,0.85)',
              p: 0.5,
              borderRadius: 3,
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <Tooltip title="放大">
              <IconButton size="small" onClick={handleZoomIn} sx={{ color: 'text.primary' }}>
                <ZoomIn size={18} />
              </IconButton>
            </Tooltip>

            <Chip
              label={`${zoomLevel}x`}
              size="small"
              sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700, bgcolor: 'surface.container', color: 'primary.light' }}
            />

            <Tooltip title="缩小">
              <IconButton size="small" onClick={handleZoomOut} sx={{ color: 'text.primary' }}>
                <ZoomOut size={18} />
              </IconButton>
            </Tooltip>

            <Tooltip title="回到鄞州区">
              <IconButton size="small" onClick={handleResetCenter} sx={{ color: 'success.light' }}>
                <Target size={18} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
