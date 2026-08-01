import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Box,
  Button,
  Chip,
  TextField,
  MenuItem,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip
} from '@mui/material';
import {
  Terminal,
  Pause,
  Play,
  Trash2,
  Search,
  Code,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

export default function DebugConsoleView({ messages = [] }) {
  const [isPaused, setIsPaused] = useState(false);
  const [topicFilter, setTopicFilter] = useState('ALL');
  const [directionFilter, setDirectionFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLogs, setDisplayLogs] = useState([]);
  const [selectedJson, setSelectedJson] = useState(null);

  useEffect(() => {
    if (!isPaused) {
      setDisplayLogs((prev) => {
        const combined = [...messages, ...prev];
        return combined.slice(0, 200);
      });
    }
  }, [messages, isPaused]);

  const filteredLogs = displayLogs.filter((log) => {
    if (topicFilter !== 'ALL' && log.topic !== topicFilter) return false;
    if (directionFilter !== 'ALL' && log.direction !== directionFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTopic = log.topic?.toLowerCase().includes(q);
      const matchStr = JSON.stringify(log.message || {}).toLowerCase().includes(q);
      return matchTopic || matchStr;
    }
    return true;
  });

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        bgcolor: 'background.paper',
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 2.5
      }}
    >
      {/* Header & Controls */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Terminal size={24} color="#7cacf8" />
          <Box>
            <Typography variant="h6" color="text.primary">
              上位机指令调试控制台 (ROS 2 Command & Telemetry Debugger)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              实时捕获控制指令下发 (Downlink) 与传感器/状态指令上传 (Uplink) 及中间状态
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant={isPaused ? 'contained' : 'outlined'}
            color={isPaused ? 'warning' : 'primary'}
            size="small"
            startIcon={isPaused ? <Play size={16} /> : <Pause size={16} />}
            onClick={() => setIsPaused(!isPaused)}
            sx={{ borderRadius: 5 }}
          >
            {isPaused ? '恢复数据流' : '暂停数据流'}
          </Button>

          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<Trash2 size={16} />}
            onClick={() => setDisplayLogs([])}
            sx={{ borderRadius: 5 }}
          >
            清屏
          </Button>
        </Box>
      </Box>

      {/* Filters Bar */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', bgcolor: 'surface.container', p: 1.5, borderRadius: 3 }}>
        <TextField
          select
          size="small"
          label="方向筛选"
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="ALL">全部方向</MenuItem>
          <MenuItem value="UPLINK">UPLINK (小车上传)</MenuItem>
          <MenuItem value="DOWNLINK">DOWNLINK (控制下发)</MenuItem>
        </TextField>

        <TextField
          select
          size="small"
          label="话题筛选"
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="ALL">全部 ROS 2 话题</MenuItem>
          <MenuItem value="/mecanum_drive_controller/reference">/mecanum_drive_controller/reference</MenuItem>
          <MenuItem value="/battery_state">/battery_state</MenuItem>
          <MenuItem value="/imu/data_raw">/imu/data_raw</MenuItem>
          <MenuItem value="/mecanum_drive_controller/odometry">/mecanum_drive_controller/odometry</MenuItem>
        </TextField>

        <TextField
          size="small"
          placeholder="搜索指令关键词..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <Search size={16} style={{ color: '#90909a', marginRight: 8 }} />
          }}
          sx={{ flex: 1, minWidth: 200 }}
        />
      </Box>

      {/* Terminal Log Output List */}
      <Box
        sx={{
          height: 520,
          bgcolor: '#090d14',
          borderRadius: 3,
          p: 2,
          overflowY: 'auto',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        {filteredLogs.length === 0 ? (
          <Box sx={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
            暂无匹配的控制/状态指令数据包
          </Box>
        ) : (
          filteredLogs.map((log, idx) => {
            const isUplink = log.direction === 'UPLINK';
            const timeStr = log.timestamp || new Date().toLocaleTimeString();

            return (
              <Box
                key={idx}
                sx={{
                  p: 1,
                  borderRadius: 2,
                  bgcolor: isUplink ? 'rgba(30, 41, 59, 0.5)' : 'rgba(37, 99, 235, 0.15)',
                  borderLeft: `4px solid ${isUplink ? '#4edea3' : '#3b82f6'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden' }}>
                  <Chip
                    icon={isUplink ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                    label={log.direction}
                    color={isUplink ? 'success' : 'primary'}
                    size="small"
                    sx={{ height: 22, fontSize: '0.7rem' }}
                  />
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                    [{timeStr}]
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontFamily: 'monospace' }}>
                    {log.topic}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', noWrap: true, fontFamily: 'monospace' }}>
                    {JSON.stringify(log.message).slice(0, 90)}...
                  </Typography>
                </Box>

                <Tooltip title="查看 JSON 原包数据">
                  <IconButton size="small" onClick={() => setSelectedJson(log.message)}>
                    <Code size={16} color="#7cacf8" />
                  </IconButton>
                </Tooltip>
              </Box>
            );
          })
        )}
      </Box>

      {/* Raw JSON Dialog */}
      <Dialog open={Boolean(selectedJson)} onClose={() => setSelectedJson(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontFamily: 'monospace' }}>ROS 2 Message Raw JSON</DialogTitle>
        <DialogContent dividers>
          <Box
            component="pre"
            sx={{
              p: 2,
              bgcolor: '#090d14',
              borderRadius: 2,
              color: '#4edea3',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '0.85rem',
              overflowX: 'auto'
            }}
          >
            {JSON.stringify(selectedJson, null, 2)}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedJson(null)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
