import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Tabs,
  Tab,
  Button,
  Chip,
  IconButton,
  Popover,
  TextField,
  Tooltip
} from '@mui/material';
import {
  Car,
  LayoutDashboard,
  Terminal,
  Database,
  Wifi,
  WifiOff,
  Settings,
  RefreshCw
} from 'lucide-react';

export default function Navbar({ activeTab, onTabChange, connectionStatus, rosUrl, onReconnect }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [customIp, setCustomIp] = useState('192.168.10.17');

  const isConnected = connectionStatus.status === 'CONNECTED';
  const isConnecting = connectionStatus.status === 'CONNECTING';

  const handleOpenConfig = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseConfig = () => {
    setAnchorEl(null);
  };

  const handleSaveIp = () => {
    const url = `ws://${customIp.replace('ws://', '')}:9090`;
    onReconnect(url);
    handleCloseConfig();
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(10px)',
        zIndex: (theme) => theme.zIndex.drawer + 1
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between', gap: 2, px: { xs: 2, md: 4 } }}>
        {/* Brand & Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 3,
              bgcolor: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(124, 172, 248, 0.3)'
            }}
          >
            <Car size={22} color="#002e69" />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}>
              SmartCar Robot
            </Typography>
            <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
              Material Design 3 上位机
            </Typography>
          </Box>
        </Box>

        {/* Navigation Tabs */}
        <Tabs
          value={activeTab}
          onChange={(e, val) => onTabChange(val)}
          textColor="primary"
          indicatorColor="primary"
          sx={{
            minHeight: 48,
            '& .MuiTab-root': {
              minHeight: 48,
              fontWeight: 600,
              borderRadius: 3,
              mx: 0.5,
              textTransform: 'none'
            }
          }}
        >
          <Tab icon={<LayoutDashboard size={18} />} iconPosition="start" label="状态控制主页" value="DASHBOARD" />
          <Tab icon={<Terminal size={18} />} iconPosition="start" label="指令调试 Console" value="DEBUG" />
          <Tab icon={<Database size={18} />} iconPosition="start" label="历史数据查询" value="QUERY" />
        </Tabs>

        {/* Right Status & IP Config */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Chip
            icon={isConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
            label={isConnected ? `已连接 (${rosUrl})` : isConnecting ? '正在连接树莓派...' : '未连接 (离线)'}
            color={isConnected ? 'success' : isConnecting ? 'warning' : 'error'}
            variant={isConnected ? 'filled' : 'outlined'}
            sx={{ fontWeight: 600 }}
          />

          <Tooltip title="配置树莓派/ROS Bridge IP 地址">
            <IconButton onClick={handleOpenConfig} color="primary" sx={{ bgcolor: 'surface.container' }}>
              <Settings size={18} />
            </IconButton>
          </Tooltip>

          <Popover
            open={Boolean(anchorEl)}
            anchorEl={anchorEl}
            onClose={handleCloseConfig}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <Box sx={{ p: 2.5, width: 300, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                ROS Bridge 通信配置
              </Typography>
              <TextField
                size="small"
                label="树莓派 / ROS 主机 IP"
                value={customIp}
                onChange={(e) => setCustomIp(e.target.value)}
                placeholder="192.168.10.17"
                helperText="默认端口 9090 (rosbridge_websocket)"
              />
              <Button variant="contained" onClick={handleSaveIp} startIcon={<RefreshCw size={16} />}>
                连接到新地址
              </Button>
            </Box>
          </Popover>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
