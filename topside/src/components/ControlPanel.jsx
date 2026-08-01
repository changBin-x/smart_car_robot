import React, { useState, useEffect } from 'react';
import { Paper, Typography, Box, Button, Slider, Chip, Grid } from '@mui/material';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  RotateCw,
  Octagon,
  Gamepad2,
  Zap,
  Gauge
} from 'lucide-react';
import { rosService } from '../services/rosbridge';

export default function ControlPanel() {
  const [linearSpeed, setLinearSpeed] = useState(0.3);
  const [angularSpeed, setAngularSpeed] = useState(0.5);

  const sendTwist = (vx, vy, wz) => {
    rosService.publishTwist(vx, vy, wz);
  };

  const handleStop = () => {
    sendTwist(0, 0, 0);
  };

  // Keyboard controls listener (WASD QE + Space)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['input', 'textarea'].includes(document.activeElement.tagName.toLowerCase())) return;

      switch (e.key.toLowerCase()) {
        case 'w':
          sendTwist(linearSpeed, 0, 0);
          break;
        case 's':
          sendTwist(-linearSpeed, 0, 0);
          break;
        case 'a':
          sendTwist(0, linearSpeed, 0);
          break;
        case 'd':
          sendTwist(0, -linearSpeed, 0);
          break;
        case 'q':
          sendTwist(0, 0, angularSpeed);
          break;
        case 'e':
          sendTwist(0, 0, -angularSpeed);
          break;
        case ' ':
          handleStop();
          break;
        default:
          break;
      }
    };

    const handleKeyUp = (e) => {
      if (['w', 'a', 's', 'd', 'q', 'e'].includes(e.key.toLowerCase())) {
        handleStop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [linearSpeed, angularSpeed]);

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
        height: '100%'
      }}
    >
      {/* Header bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Gamepad2 size={22} color="#7cacf8" />
          <Typography variant="h6" color="text.primary">
            麦轮全向遥控面板 (Omnidirectional Control)
          </Typography>
        </Box>
        <Chip label="WASD / QE 键盘热键激活" size="small" color="primary" variant="outlined" />
      </Box>

      {/* Speed Sliders & Direction Grid */}
      <Grid container spacing={3} alignItems="center">
        {/* Speed Controls Column */}
        <Grid item xs={12} md={5}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2, bgcolor: 'surface.container', borderRadius: 3 }}>
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Zap size={14} color="#7cacf8" /> 线速度限制 (Linear Speed)
                </Typography>
                <Typography variant="body2" color="primary.light" sx={{ fontWeight: 700 }}>
                  {linearSpeed.toFixed(1)} m/s
                </Typography>
              </Box>
              <Slider
                value={linearSpeed}
                min={0.1}
                max={1.5}
                step={0.1}
                onChange={(e, val) => setLinearSpeed(val)}
                valueLabelDisplay="auto"
                size="small"
              />
            </Box>

            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Gauge size={14} color="#ffb86c" /> 角速度限制 (Angular Speed)
                </Typography>
                <Typography variant="body2" color="status.warn" sx={{ fontWeight: 700 }}>
                  {angularSpeed.toFixed(1)} rad/s
                </Typography>
              </Box>
              <Slider
                value={angularSpeed}
                min={0.1}
                max={3.0}
                step={0.1}
                onChange={(e, val) => setAngularSpeed(val)}
                valueLabelDisplay="auto"
                color="warning"
                size="small"
              />
            </Box>
          </Box>
        </Grid>

        {/* D-Pad Buttons Column */}
        <Grid item xs={12} md={7}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            {/* Top row: Q (Left Rotate), W (Forward), E (Right Rotate) */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                color="secondary"
                size="small"
                startIcon={<RotateCcw size={16} />}
                onMouseDown={() => sendTwist(0, 0, angularSpeed)}
                onMouseUp={handleStop}
                sx={{ borderRadius: 3, minWidth: 90 }}
              >
                左旋 (Q)
              </Button>
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<ArrowUp size={16} />}
                onMouseDown={() => sendTwist(linearSpeed, 0, 0)}
                onMouseUp={handleStop}
                sx={{ borderRadius: 3, minWidth: 100 }}
              >
                前进 (W)
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                size="small"
                endIcon={<RotateCw size={16} />}
                onMouseDown={() => sendTwist(0, 0, -angularSpeed)}
                onMouseUp={handleStop}
                sx={{ borderRadius: 3, minWidth: 90 }}
              >
                右旋 (E)
              </Button>
            </Box>

            {/* Middle row: A (Left Strafe), STOP (Emergency), D (Right Strafe) */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                color="info"
                size="small"
                startIcon={<ArrowLeft size={16} />}
                onMouseDown={() => sendTwist(0, linearSpeed, 0)}
                onMouseUp={handleStop}
                sx={{ borderRadius: 3, minWidth: 90 }}
              >
                左平移 (A)
              </Button>
              <Button
                variant="contained"
                color="error"
                size="small"
                startIcon={<Octagon size={16} />}
                onClick={handleStop}
                sx={{ borderRadius: 3, minWidth: 100, fontWeight: 700, px: 2 }}
              >
                急停 (Space)
              </Button>
              <Button
                variant="contained"
                color="info"
                size="small"
                endIcon={<ArrowRight size={16} />}
                onMouseDown={() => sendTwist(0, -linearSpeed, 0)}
                onMouseUp={handleStop}
                sx={{ borderRadius: 3, minWidth: 90 }}
              >
                右平移 (D)
              </Button>
            </Box>

            {/* Bottom row: S (Backward) */}
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<ArrowDown size={16} />}
                onMouseDown={() => sendTwist(-linearSpeed, 0, 0)}
                onMouseUp={handleStop}
                sx={{ borderRadius: 3, minWidth: 100 }}
              >
                后退 (S)
              </Button>
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
}
