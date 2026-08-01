import React from 'react';
import { Paper, Typography, Box, LinearProgress, Chip } from '@mui/material';
import { BatteryCharging, BatteryWarning } from 'lucide-react';

export default function BatteryWidget({ voltage = 0, percentage = 0 }) {
  const cellAvg = (voltage / 3).toFixed(2);
  
  let color = 'success';
  let statusText = '电量正常';
  if (percentage <= 20) {
    color = 'error';
    statusText = '电量极低，推荐充电';
  } else if (percentage <= 40) {
    color = 'warning';
    statusText = '电量中等';
  }

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        bgcolor: 'background.paper',
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        height: '100%'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {percentage <= 20 ? (
            <BatteryWarning size={22} color="#ff897d" />
          ) : (
            <BatteryCharging size={22} color="#7cacf8" />
          )}
          <Typography variant="h6" color="text.primary">
            电池状态 (3S8P 三元锂)
          </Typography>
        </Box>
        <Chip
          label={statusText}
          color={color}
          size="small"
          variant="outlined"
          sx={{ fontWeight: 600 }}
        />
      </Box>

      {/* Main Percentage & Voltage */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mt: 1 }}>
        <Typography variant="h3" sx={{ fontWeight: 700, color: percentage <= 20 ? 'error.main' : 'primary.main' }}>
          {percentage}%
        </Typography>
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="h5" sx={{ fontWeight: 600, color: 'text.primary' }}>
            {voltage > 0 ? `${voltage.toFixed(2)} V` : '-- V'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            组电压 (9.0V - 12.6V)
          </Typography>
        </Box>
      </Box>

      {/* Progress Bar */}
      <Box sx={{ width: '100%', my: 0.5 }}>
        <LinearProgress
          variant="determinate"
          value={percentage}
          color={color}
          sx={{
            height: 10,
            borderRadius: 5,
            bgcolor: 'surface.containerHigh'
          }}
        />
      </Box>

      {/* 3S Cells Breakdown */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1,
          pt: 1,
          borderTop: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        {[1, 2, 3].map((cellIdx) => (
          <Box
            key={cellIdx}
            sx={{
              p: 1,
              bgcolor: 'surface.container',
              borderRadius: 2,
              textAlign: 'center'
            }}
          >
            <Typography variant="caption" color="text.secondary" display="block">
              单体 S{cellIdx}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.light' }}>
              {voltage > 0 ? `${cellAvg} V` : '--'}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
