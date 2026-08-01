import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Box,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid
} from '@mui/material';
import { Database, Search, Download, Eye, Server, Activity, ShieldCheck } from 'lucide-react';

export default function DataQueryView() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ total_records: 0, unique_topics: 0, latest_timestamp: null });
  const [topicFilter, setTopicFilter] = useState('');
  const [dirFilter, setDirFilter] = useState('ALL');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/logs/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (e) {
      console.error('Fetch stats error', e);
    }
  };

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams({
        page: page + 1,
        pageSize: rowsPerPage,
        topic: topicFilter,
        direction: dirFilter
      });
      const res = await fetch(`/api/logs?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.records);
      }
    } catch (e) {
      console.error('Fetch logs error', e);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchLogs();
  }, [page, rowsPerPage, dirFilter]);

  const handleSearch = () => {
    setPage(0);
    fetchLogs();
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `smartcar_telemetry_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, width: '100%' }}>
      {/* Top Database Stats Cards Bar */}
      <Grid container spacing={2} sx={{ width: '100%' }}>
        <Grid item xs={12} sm={4}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              bgcolor: 'background.paper',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 2
            }}
          >
            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: 'rgba(124, 172, 248, 0.1)' }}>
              <Database size={24} color="#7cacf8" />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                持久化日志记录总数
              </Typography>

              <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                {stats.total_records} 条
              </Typography>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              bgcolor: 'background.paper',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 2
            }}
          >
            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: 'rgba(78, 222, 163, 0.1)' }}>
              <Activity size={24} color="#4edea3" />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                归档 ROS 2 话题数
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                {stats.unique_topics} 个话题
              </Typography>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              bgcolor: 'background.paper',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 2
            }}
          >
            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: 'rgba(255, 184, 108, 0.1)' }}>
              <ShieldCheck size={24} color="#ffb86c" />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                数据库安全与健康状态
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'status.ok' }}>
                SQLite Ready
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Query Filter Toolbar */}
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', flex: 1 }}>
          <TextField
            size="small"
            placeholder="按话题关键字查询..."
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            sx={{ width: 240, bgcolor: 'surface.container', borderRadius: 2 }}
          />

          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Chip
              label="全部"
              size="small"
              color={dirFilter === 'ALL' ? 'primary' : 'default'}
              onClick={() => setDirFilter('ALL')}
            />
            <Chip
              label="下发 Downlink"
              size="small"
              color={dirFilter === 'DOWNLINK' ? 'secondary' : 'default'}
              onClick={() => setDirFilter('DOWNLINK')}
            />
            <Chip
              label="上报 Uplink"
              size="small"
              color={dirFilter === 'UPLINK' ? 'info' : 'default'}
              onClick={() => setDirFilter('UPLINK')}
            />
          </Box>

          <Button variant="contained" size="small" startIcon={<Search size={16} />} onClick={handleSearch}>
            查询数据库
          </Button>
        </Box>

        <Button
          variant="outlined"
          size="small"
          startIcon={<Download size={16} />}
          onClick={handleExportJSON}
        >
          导出 JSON 数据
        </Button>
      </Paper>

      {/* Fluid Table View */}
      <Paper
        elevation={0}
        sx={{
          flex: 1,
          width: '100%',
          bgcolor: 'background.paper',
          borderRadius: 4,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <TableContainer sx={{ flex: 1, width: '100%' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ bgcolor: 'surface.container', fontWeight: 700 }}>记录 ID</TableCell>
                <TableCell sx={{ bgcolor: 'surface.container', fontWeight: 700 }}>时间戳</TableCell>
                <TableCell sx={{ bgcolor: 'surface.container', fontWeight: 700 }}>传输方向</TableCell>
                <TableCell sx={{ bgcolor: 'surface.container', fontWeight: 700 }}>ROS 2 话题</TableCell>
                <TableCell sx={{ bgcolor: 'surface.container', fontWeight: 700 }}>RAW 消息摘要</TableCell>
                <TableCell sx={{ bgcolor: 'surface.container', fontWeight: 700, textAlign: 'right' }}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    数据库中未找到符合条件的历史轨迹记录
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                      #{row.id}
                    </TableCell>
                    <TableCell>{new Date(row.timestamp).toLocaleString()}</TableCell>
                    <TableCell>
                      <Chip
                        label={row.direction}
                        size="small"
                        color={row.direction === 'DOWNLINK' ? 'secondary' : 'info'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: 'primary.light' }}>
                      {row.topic}
                    </TableCell>
                    <TableCell
                      sx={{
                        maxWidth: 300,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontFamily: 'monospace',
                        color: 'text.secondary'
                      }}
                    >
                      {JSON.stringify(row.payload)}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => setSelectedRecord(row)}>
                        <Eye size={16} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={stats.total_records}
          page={page}
          onPageChange={(e, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 15, 25, 50]}
          sx={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}
        />
      </Paper>

      {/* Detail Dialog */}
      <Dialog
        open={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { bgcolor: 'background.paper', borderRadius: 4 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">历史记录详情 #{selectedRecord?.id}</Typography>
          {selectedRecord && <Chip label={selectedRecord.topic} color="primary" size="small" />}
        </DialogTitle>
        <DialogContent dividers>
          {selectedRecord && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  记录时间: {new Date(selectedRecord.timestamp).toLocaleString()}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  方向: {selectedRecord.direction}
                </Typography>
              </Box>

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
                {JSON.stringify(selectedRecord.payload, null, 2)}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button variant="contained" onClick={() => setSelectedRecord(null)}>
            关闭
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
