import React, { useState } from 'react';
import {
  Paper,
  Typography,
  Box,
  TextField,
  IconButton,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { Terminal, Trash2, Pause, Play, Eye, Filter } from 'lucide-react';

export default function DebugConsoleView({ messages = [] }) {
  const [filterTopic, setFilterTopic] = useState('');
  const [filterDir, setFilterDir] = useState('ALL');
  const [isPaused, setIsPaused] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState(null);

  const filtered = messages.filter((msg) => {
    const matchTopic = msg.topic.toLowerCase().includes(filterTopic.toLowerCase());
    const matchDir = filterDir === 'ALL' || msg.direction === filterDir;
    return matchTopic && matchDir;
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%', gap: 2 }}>
      {/* Console Top Toolbar */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
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
          <Terminal size={22} color="#7cacf8" />
          <Typography variant="h6" color="text.primary">
            ROS 2 指令调试 Console (Real-time Stream)
          </Typography>
          <Chip label={`${filtered.length} 条记录`} size="small" color="primary" />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {/* Topic filter input */}
          <TextField
            size="small"
            placeholder="过滤话题名称..."
            value={filterTopic}
            onChange={(e) => setFilterTopic(e.target.value)}
            sx={{ width: 180, bgcolor: 'surface.container', borderRadius: 2 }}
          />

          {/* Direction filter chips */}
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Chip
              label="全部"
              size="small"
              color={filterDir === 'ALL' ? 'primary' : 'default'}
              onClick={() => setFilterDir('ALL')}
            />
            <Chip
              label="下发 Downlink"
              size="small"
              color={filterDir === 'DOWNLINK' ? 'secondary' : 'default'}
              onClick={() => setFilterDir('DOWNLINK')}
            />
            <Chip
              label="上报 Uplink"
              size="small"
              color={filterDir === 'UPLINK' ? 'info' : 'default'}
              onClick={() => setFilterDir('UPLINK')}
            />
          </Box>

          <Button
            variant="outlined"
            size="small"
            color={isPaused ? 'success' : 'warning'}
            startIcon={isPaused ? <Play size={16} /> : <Pause size={16} />}
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? '继续数据流' : '暂停打印'}
          </Button>
        </Box>
      </Paper>

      {/* Terminal View Body - Dynamic Height Container */}
      <Paper
        elevation={0}
        sx={{
          flex: 1,
          width: '100%',
          minHeight: 'calc(100vh - 240px)',
          p: 2,
          bgcolor: '#0d1117',
          borderRadius: 4,
          fontFamily: 'monospace',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        {filtered.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              color: 'text.secondary',
              gap: 1
            }}
          >
            <Filter size={32} />
            <Typography variant="body2">暂无符合条件的控制/状态指令传输日志</Typography>
          </Box>
        ) : (
          filtered.map((item, index) => (
            <Box
              key={index}
              sx={{
                py: 1,
                px: 1.5,
                borderRadius: 2,
                mb: 0.5,
                bgcolor: index % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.05)' },
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden' }}>
                <Typography variant="caption" sx={{ color: '#6e7681', flexShrink: 0 }}>
                  [{item.timestamp}]
                </Typography>

                <Chip
                  label={item.direction}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.7rem',
                    bgcolor: item.direction === 'DOWNLINK' ? 'rgba(236, 72, 153, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                    color: item.direction === 'DOWNLINK' ? '#f472b6' : '#60a5fa',
                    border: '1px solid',
                    borderColor: item.direction === 'DOWNLINK' ? '#ec4899' : '#3b82f6',
                    flexShrink: 0
                  }}
                />

                <Typography variant="body2" sx={{ color: '#a5d6ff', fontWeight: 600, flexShrink: 0 }}>
                  {item.topic}
                </Typography>

                <Typography
                  variant="caption"
                  sx={{
                    color: '#c9d1d9',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {JSON.stringify(item.message)}
                </Typography>
              </Box>

              <IconButton size="small" onClick={() => setSelectedMsg(item)} sx={{ color: '#7d8590' }}>
                <Eye size={16} />
              </IconButton>
            </Box>
          ))
        )}
      </Paper>

      {/* JSON Payload Detail Dialog */}
      <Dialog
        open={Boolean(selectedMsg)}
        onClose={() => setSelectedMsg(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { bgcolor: 'background.paper', borderRadius: 4 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">指令 RAW JSON 数据载荷详情</Typography>
          {selectedMsg && <Chip label={selectedMsg.topic} color="primary" size="small" />}
        </DialogTitle>
        <DialogContent dividers>
          {selectedMsg && (
            <Box
              component="pre"
              sx={{
                p: 2,
                bgcolor: '#0d1117',
                borderRadius: 3,
                color: '#7ee787',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                overflowX: 'auto'
              }}
            >
              {JSON.stringify(selectedMsg.message, null, 2)}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button variant="contained" onClick={() => setSelectedMsg(null)}>
            关闭
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
