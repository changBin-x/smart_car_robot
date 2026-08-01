import React, { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Typography,
  Box,
  Button,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  MenuItem,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Database,
  Search,
  Download,
  RefreshCw,
  Code,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

export default function DataQueryView() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [topic, setTopic] = useState('ALL');
  const [direction, setDirection] = useState('ALL');
  const [search, setSearch] = useState('');
  const [topicsList, setTopicsList] = useState([]);
  const [stats, setStats] = useState({ totalLogs: 0, uplinkCount: 0, downlinkCount: 0 });
  const [loading, setLoading] = useState(false);
  const [selectedJson, setSelectedJson] = useState(null);

  const fetchTopics = async () => {
    try {
      const res = await fetch('/api/logs/topics');
      const data = await res.json();
      if (data.success) setTopicsList(data.topics);
    } catch (e) {
      console.error('Failed to fetch topics:', e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/logs/stats');
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: rowsPerPage,
        offset: page * rowsPerPage
      });
      if (topic !== 'ALL') params.append('topic', topic);
      if (direction !== 'ALL') params.append('direction', direction);
      if (search) params.append('search', search);

      const res = await fetch(`/api/logs?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.rows);
        setTotal(data.total);
      }
    } catch (e) {
      console.error('Failed to fetch logs:', e);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, topic, direction, search]);

  useEffect(() => {
    fetchTopics();
    fetchStats();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExportJson = () => {
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartcar_telemetry_export_${Date.now()}.json`;
    a.click();
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        bgcolor: 'background.paper',
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 3
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Database size={24} color="#7cacf8" />
          <Box>
            <Typography variant="h6" color="text.primary">
              SQLite 数据库历史指令与遥测查询 (Telemetry Data Center)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              支持按时间、方向、ROS 2 话题检索持久化数据并导出 JSON
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshCw size={16} />}
            onClick={() => {
              fetchStats();
              fetchLogs();
            }}
            sx={{ borderRadius: 5 }}
          >
            刷新数据
          </Button>

          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<Download size={16} />}
            onClick={handleExportJson}
            sx={{ borderRadius: 5 }}
          >
            导出 JSON 记录
          </Button>
        </Box>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <Paper elevation={0} sx={{ p: 2, bgcolor: 'surface.container', borderRadius: 3, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              累计持久化记录总数
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main', mt: 0.5 }}>
              {stats.totalLogs}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Paper elevation={0} sx={{ p: 2, bgcolor: 'surface.container', borderRadius: 3, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              UPLINK (传感器/状态上传)
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color: 'status.ok', mt: 0.5 }}>
              {stats.uplinkCount}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Paper elevation={0} sx={{ p: 2, bgcolor: 'surface.container', borderRadius: 3, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              DOWNLINK (控制指令下发)
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color: 'status.info', mt: 0.5 }}>
              {stats.downlinkCount}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Search & Filters */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', bgcolor: 'surface.container', p: 1.5, borderRadius: 3 }}>
        <TextField
          select
          size="small"
          label="数据方向"
          value={direction}
          onChange={(e) => {
            setDirection(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="ALL">全部方向</MenuItem>
          <MenuItem value="UPLINK">UPLINK (小车上传)</MenuItem>
          <MenuItem value="DOWNLINK">DOWNLINK (控制下发)</MenuItem>
        </TextField>

        <TextField
          select
          size="small"
          label="ROS 2 话题"
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 240 }}
        >
          <MenuItem value="ALL">全部 ROS 2 话题</MenuItem>
          {topicsList.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          size="small"
          placeholder="关键词搜索 (JSON / 摘要)..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          InputProps={{
            startAdornment: <Search size={16} style={{ color: '#90909a', marginRight: 8 }} />
          }}
          sx={{ flex: 1, minWidth: 220 }}
        />
      </Box>

      {/* Table & Pagination */}
      <TableContainer component={Paper} elevation={0} sx={{ bgcolor: 'surface.container', borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>ID</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>时间 (Timestamp)</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>方向</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>ROS 2 话题 (Topic)</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>消息摘要 (Summary)</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }} align="right">
                操作
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  数据库查询中...
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  未查询到符合条件的历史记录
                </TableCell>
              </TableRow>
            ) : (
              logs.map((row) => {
                const isUplink = row.direction === 'UPLINK';
                return (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace' }}>#{row.id}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{row.timestamp}</TableCell>
                    <TableCell>
                      <Chip
                        icon={isUplink ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                        label={row.direction}
                        color={isUplink ? 'success' : 'primary'}
                        size="small"
                        sx={{ height: 22, fontSize: '0.7rem' }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{row.topic}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{row.summary || '--'}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => setSelectedJson(row.parsedData || row.data)}>
                        <Code size={16} color="#7cacf8" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[15, 30, 50]}
          component="div"
          count={total}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(e, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </TableContainer>

      {/* JSON Viewer Dialog */}
      <Dialog open={Boolean(selectedJson)} onClose={() => setSelectedJson(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontFamily: 'monospace' }}>Database Stored Raw JSON Payload</DialogTitle>
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
