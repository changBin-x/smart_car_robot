/**
 * @Author: ChangBin bin_chang@qq.com
 * @Date: 2026-08-04 00:49:20
 * @LastEditors: ChangBin bin_chang@qq.com
 * @LastEditTime: 2026-08-04
 * @Copyright (c) 2026 by ChangBin, All Rights Reserved.
 * @Description: 上位机仪表盘主布局：速度遥测、地图+相机并排、3D 姿态与电池/遥控同列。
 */
import React from 'react';
import { Box, Paper, Typography, Grid } from '@mui/material';
import { Gauge } from 'lucide-react';
import BatteryWidget from './BatteryWidget';
import Car3DView from './Car3DView';
import MapCameraView from './MapCameraView';
import CameraView from './CameraView';
import ControlPanel from './ControlPanel';

/**
 * 智能车上位机仪表盘视图。
 *
 * 布局（桌面）：
 * 1. 全宽速度遥测条
 * 2. 地图 | 相机（同行同时可见）
 * 3. 3D 姿态 | 电池 + 麦轮遥控（同列）
 *
 * @param {object} props 组件属性。
 * @param {object} props.telemetry 遥测数据。
 * @param {string} [props.cameraHost] 摄像机主机地址。
 * @returns {JSX.Element} 仪表盘根节点。
 */
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
    odomY = 0,
  } = telemetry;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        flex: 1,
        width: '100%',
      }}
    >
      {/* 速度遥测条 — 全宽 */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, md: 2 },
          bgcolor: 'background.paper',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
          width: '100%',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              p: 1.2,
              borderRadius: 3,
              bgcolor: 'rgba(124, 172, 248, 0.1)',
              color: 'primary.main',
              display: 'flex',
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
              {linearX.toFixed(2)}{' '}
              <Typography component="span" variant="caption">
                m/s
              </Typography>
            </Typography>
          </Box>

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              左右线速度 Vy
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'status.ok' }}>
              {linearY.toFixed(2)}{' '}
              <Typography component="span" variant="caption">
                m/s
              </Typography>
            </Typography>
          </Box>

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              旋转角速度 Wz
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'status.warn' }}>
              {angularZ.toFixed(2)}{' '}
              <Typography component="span" variant="caption">
                rad/s
              </Typography>
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* 地图 | 相机 — 同行同时显示 */}
      <Grid container spacing={2} sx={{ width: '100%', alignItems: 'stretch' }}>
        <Grid
          item
          xs={12}
          md={6}
          sx={{ display: 'flex', minHeight: { xs: 320, md: 380 } }}
        >
          <MapCameraView odomX={odomX} odomY={odomY} />
        </Grid>
        <Grid
          item
          xs={12}
          md={6}
          sx={{ display: 'flex', minHeight: { xs: 320, md: 380 } }}
        >
          <CameraView cameraHost={cameraHost} />
        </Grid>
      </Grid>

      {/* 3D 姿态 | 电池 + 遥控同列 */}
      <Grid container spacing={2} sx={{ width: '100%', alignItems: 'stretch', flex: 1 }}>
        <Grid
          item
          xs={12}
          md={5}
          lg={5}
          sx={{ display: 'flex', minHeight: { xs: 280, md: 320 } }}
        >
          <Car3DView roll={roll} pitch={pitch} yaw={yaw} />
        </Grid>
        <Grid
          item
          xs={12}
          md={7}
          lg={7}
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <Box sx={{ width: '100%', flexShrink: 0 }}>
            <BatteryWidget voltage={voltage} percentage={percentage} />
          </Box>
          <Box sx={{ width: '100%', flex: 1 }}>
            <ControlPanel />
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
