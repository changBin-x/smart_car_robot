import React, { useState, useEffect, useCallback } from 'react';
import { Paper, Typography, Box, Button, Slider, Chip, Tooltip } from '@mui/material';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  RotateCw,
  Square,
  Keyboard,
  Gamepad
} from 'lucide-react';
import { rosService } from '../services/rosbridge';

export default function ControlPanel() {
  const [linearSpeed, setLinearSpeed] = useState(0.4);
  const [angularSpeed, setAngularSpeed] = useState(1.2);
  const [activeKey, setActiveKey] = useState(null);

  const sendCommand = useCallback((lx, ly, az) => {
    rosService.publishCmdVel(lx, ly, az);
  }, []);

  const stopRobot = useCallback(() => {
    sendCommand(0, 0, 0);
  }, [sendCommand]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (['w', 's', 'a', 'd', 'q', 'e', ' '].includes(key)) {
        setActiveKey(key);
        if (key === 'w') sendCommand(linearSpeed, 0, 0);
        else if (key === 's') sendCommand(-linearSpeed, 0, 0);
        else if (key === 'a') sendCommand(0, linearSpeed, 0);
        else if (key === 'd') sendCommand(0, -linearSpeed, 0);
        else if (key === 'q') sendCommand(0, 0, angularSpeed);
        else if (key === 'e') sendCommand(0, 0, -angularSpeed);
        else if (key === ' ') stopRobot();
      }
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      if (['w', 's', 'a', 'd', 'q', 'e'].includes(key)) {
        setActiveKey(null);
        stopRobot();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [linearSpeed, angularSpeed, sendCommand, stopRobot]);

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
        height: '100%'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Gamepad size={22} color="#7cacf8" />
          <Typography variant="h6" color="text.primary">
            全向麦轮控制面板
          </Typography>
        </Box>
        <Tooltip title="支持键盘 WASD QE 控制">
          <Chip icon={<Keyboard size={14} />} label="键盘控制响应" color="primary" size="small" variant="outlined" />
        </Tooltip>
      </Box>

      {/* Speed Sliders */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, bgcolor: 'surface.container', p: 2, borderRadius: 3 }}>
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              平移线速度 (Linear Speed)
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.light' }}>
              {linearSpeed.toFixed(1)} m/s
            </Typography>
          </Box>
          <Slider
            size="small"
            value={linearSpeed}
            min={0.1}
            max={1.0}
            step={0.05}
            onChange={(e, val) => setLinearSpeed(val)}
          />
        </Box>

        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              旋转角速度 (Angular Speed)
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.light' }}>
              {angularSpeed.toFixed(1)} rad/s
            </Typography>
          </Box>
          <Slider
            size="small"
            value={angularSpeed}
            min={0.2}
            max={3.0}
            step={0.1}
            onChange={(e, val) => setAngularSpeed(val)}
          />
        </Box>
      </Box>

      {/* Direction Button Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1.5,
          alignItems: 'center',
          justifyItems: 'center'
        }}
      >
        <Button
          variant={activeKey === 'q' ? 'contained' : 'outlined'}
          color="secondary"
          onClick={() => sendCommand(0, 0, angularSpeed)}
          sx={{ width: '100%', height: 48, borderRadius: 3 }}
        >
          <RotateCcw size={18} style={{ marginRight: 4 }} /> Q
        </Button>
        <Button
          variant={activeKey === 'w' ? 'contained' : 'contained'}
          color="primary"
          onClick={() => sendCommand(linearSpeed, 0, 0)}
          sx={{ width: '100%', height: 48, borderRadius: 3 }}
        >
          <ArrowUp size={18} style={{ marginRight: 4 }} /> 前进 (W)
        </Button>
        <Button
          variant={activeKey === 'e' ? 'contained' : 'outlined'}
          color="secondary"
          onClick={() => sendCommand(0, 0, -angularSpeed)}
          sx={{ width: '100%', height: 48, borderRadius: 3 }}
        >
          <RotateCw size={18} style={{ marginRight: 4 }} /> E
        </Button>

        <Button
          variant={activeKey === 'a' ? 'contained' : 'outlined'}
          color="primary"
          onClick={() => sendCommand(0, linearSpeed, 0)}
          sx={{ width: '100%', height: 48, borderRadius: 3 }}
        >
          <ArrowLeft size={18} style={{ marginRight: 4 }} /> 左平移 (A)
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={stopRobot}
          sx={{ width: '100%', height: 48, borderRadius: 3, fontWeight: 700 }}
        >
          <Square size={16} style={{ marginRight: 4 }} /> 急停
        </Button>
        <Button
          variant={activeKey === 'd' ? 'contained' : 'outlined'}
          color="primary"
          onClick={() => sendCommand(0, -linearSpeed, 0)}
          sx={{ width: '100%', height: 48, borderRadius: 3 }}
        >
          右平移 (D) <ArrowRight size={18} style={{ marginLeft: 4 }} />
        </Button>

        <div />
        <Button
          variant={activeKey === 's' ? 'contained' : 'outlined'}
          color="primary"
          onClick={() => sendCommand(-linearSpeed, 0, 0)}
          sx={{ width: '100%', height: 48, borderRadius: 3 }}
        >
          <ArrowDown size={18} style={{ marginRight: 4 }} /> 后退 (S)
        </Button>
        <div />
      </Box>
    </Paper>
  );
}
