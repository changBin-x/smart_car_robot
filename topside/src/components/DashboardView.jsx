import React from 'react';
import { Box, Paper, Typography, Grid } from '@mui/material';
import { Gauge } from 'lucide-react';
import BatteryWidget from './BatteryWidget';
import Car3DView from './Car3DView';
import MapCameraView from './MapCameraView';
import ControlPanel from './ControlPanel';

export default function DashboardView({ telemetry, cameraHost }) {
  const {
    voltage = 0,
    percentage = 0,
    linearX = 0,
    linearY = 0,
    angularZ = 0,
    roll = 0,
    pitch = 0,
    yaw = 0,
    odomX = 0,
    odomY = 0
  } = telemetry;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, width: '100%' }}>
      {/* Top Velocity & Telemetry Header Bar */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          bgcolor: 'background.paper',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
          width: '100%'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              p: 1.2,
              borderRadius: 3,
              bgcolor: 'rgba(124, 172, 248, 0.1)',
              color: 'primary.main',
              display: 'flex'
            }}
          >
            <Gauge size={24} color="#7cacf8" />
          </Box>
          <Box>
            <Typography variant="h6" color="text.primary" sx={{ lineHeight: 1.2 }}>
              实时运动速度解算 (Velocity Telemetry)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              来源于 mecanum_drive_controller 编码器闭环反馈
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              前后线速度 Vx
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.light' }}>
              {linearX.toFixed(2)} <Typography component="span" variant="caption">m/s</Typography>
            </Typography>
          </Box>

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              左右线速度 Vy
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'status.ok' }}>
              {linearY.toFixed(2)} <Typography component="span" variant="caption">m/s</Typography>
            </Typography>
          </Box>

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              旋转角速度 Wz
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'status.warn' }}>
              {angularZ.toFixed(2)} <Typography component="span" variant="caption">rad/s</Typography>
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Main 2-Column Balanced Dashboard Layout (Zero empty space) */}
      <Grid container spacing={3} sx={{ flex: 1, width: '100%', alignItems: 'stretch' }}>
        {/* Left Main Column (65% width): Map at top, Control Panel stretching full width at bottom */}
        <Grid item xs={12} lg={7} xl={8} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ flex: 1, display: 'flex', width: '100%' }}>
            <MapCameraView odomX={odomX} odomY={odomY} cameraHost={cameraHost} />
          </Box>
          <Box sx={{ width: '100%' }}>
            <ControlPanel />
          </Box>
        </Grid>

        {/* Right Sidebar Column (35% width): 3D Attitude View at top, Battery Widget at bottom */}
        <Grid item xs={12} lg={5} xl={4} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ flex: 1, display: 'flex', width: '100%' }}>
            <Car3DView roll={roll} pitch={pitch} yaw={yaw} />
          </Box>
          <Box sx={{ flex: 1, display: 'flex', width: '100%' }}>
            <BatteryWidget voltage={voltage} percentage={percentage} />
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
