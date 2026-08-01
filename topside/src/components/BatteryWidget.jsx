import React from 'react';
import { Paper, Typography, Box, LinearProgress, Chip, Grid } from '@mui/material';
import { Battery, Zap, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function BatteryWidget({ voltage = 0, percentage = 0 }) {
  // 3S8P Ternary Lithium Battery Specification
  // Cell range: 3.0V (0%) - 4.2V (100%), Total Pack: 9.0V - 12.6V
  const currentVoltage = voltage > 0 ? voltage : 11.1; // Default nominal 11.1V if initial telemetry disconnected
  const currentPercentage = Math.min(Math.max(percentage || Math.round(((currentVoltage - 9.0) / 3.6) * 100), 0), 100);

  const cellVoltage = (currentVoltage / 3).toFixed(2);
  const isLowPower = currentPercentage <= 20;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        bgcolor: 'background.paper',
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        width: '100%',
        height: '100%',
        minHeight: 280
      }}
    >
      {/* Header bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Battery size={22} color={isLowPower ? '#ff897d' : '#4edea3'} />
          <Typography variant="h6" color="text.primary">
            电池状态 (3S8P 三元锂电池)
          </Typography>
        </Box>
        <Chip
          icon={isLowPower ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
          label={isLowPower ? '低电量警告' : '状态正常'}
          size="small"
          color={isLowPower ? 'error' : 'success'}
          variant="outlined"
        />
      </Box>

      {/* Main Percentage Display */}
      <Box
        sx={{
          p: 2,
          bgcolor: 'surface.container',
          borderRadius: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Box>
          <Typography variant="h3" sx={{ fontWeight: 800, color: isLowPower ? 'error.main' : 'primary.light' }}>
            {currentPercentage}%
          </Typography>
          <Typography variant="caption" color="text.secondary">
            组电压范围: 9.0V - 12.6V (3串8并)
          </Typography>
        </Box>

        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary' }}>
            {currentVoltage.toFixed(1)} <Typography component="span" variant="body2">V</Typography>
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
            <Zap size={12} color="#ffb86c" /> 单体均压: {cellVoltage} V
          </Typography>
        </Box>
      </Box>

      {/* Progress Bar */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="caption" color="text.secondary">
            电池组估算剩余容量
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 600, color: isLowPower ? 'error.main' : 'status.ok' }}>
            {currentPercentage}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={currentPercentage}
          color={isLowPower ? 'error' : 'success'}
          sx={{ height: 10, borderRadius: 5, bgcolor: 'rgba(255, 255, 255, 0.05)' }}
        />
      </Box>

      {/* 3S Breakdown Grid */}
      <Grid container spacing={1.5} sx={{ mt: 'auto' }}>
        <Grid item xs={4}>
          <Box sx={{ p: 1.2, bgcolor: 'surface.container', borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              串联单体 S1
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {cellVoltage} V
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={4}>
          <Box sx={{ p: 1.2, bgcolor: 'surface.container', borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              串联单体 S2
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {cellVoltage} V
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={4}>
          <Box sx={{ p: 1.2, bgcolor: 'surface.container', borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              串联单体 S3
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {cellVoltage} V
            </Typography>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
}
