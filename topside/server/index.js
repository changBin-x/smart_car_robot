import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { insertLog, queryLogs, getTopicsList, getStats, clearLogs } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
let PORT = process.env.PORT || 3030;

app.use(cors());
app.use(express.json());

// Serve Production Frontend Dist Assets
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// REST API for Data Query Page
app.get('/api/logs', (req, res) => {
  try {
    const { startDate, endDate, topic, direction, search, limit, offset } = req.query;
    const result = queryLogs({ startDate, endDate, topic, direction, search, limit, offset });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/logs/topics', (req, res) => {
  try {
    const topics = getTopicsList();
    res.json({ success: true, topics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/logs/stats', (req, res) => {
  try {
    const stats = getStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/logs', (req, res) => {
  try {
    const { direction, topic, msg_type, data, summary } = req.body;
    insertLog({ direction, topic, msg_type, data, summary });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/logs', (req, res) => {
  try {
    clearLogs();
    res.json({ success: true, message: 'All logs cleared' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback all SPA routes to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ROS Bridge Telemetry Logger Agent
let rosWs = null;
let rosUrl = process.env.ROS_BRIDGE_URL || 'ws://192.168.10.17:9090';

function connectRosBridge() {
  console.log(`[Topside Backend] Connecting to ROS Bridge at ${rosUrl}...`);
  try {
    rosWs = new WebSocket(rosUrl);

    rosWs.on('open', () => {
      console.log(`[Topside Backend] Connected to ROS Bridge ${rosUrl}`);
      const topicsToSubscribe = [
        { topic: '/battery_state', type: 'sensor_msgs/msg/BatteryState' },
        { topic: '/imu/data_raw', type: 'sensor_msgs/msg/Imu' },
        { topic: '/mecanum_drive_controller/odometry', type: 'nav_msgs/msg/Odometry' },
        { topic: '/mecanum_drive_controller/reference', type: 'geometry_msgs/msg/TwistStamped' },
        { topic: '/joint_states', type: 'sensor_msgs/msg/JointState' }
      ];

      topicsToSubscribe.forEach(sub => {
        rosWs.send(JSON.stringify({
          op: 'subscribe',
          topic: sub.topic,
          type: sub.type
        }));
      });
    });

    const lastWriteTimes = {};

    rosWs.on('message', (rawMsg) => {
      try {
        const msg = JSON.parse(rawMsg.toString());
        if (msg.op === 'publish' && msg.topic) {
          const now = Date.now();
          const minInterval = msg.topic.includes('imu') || msg.topic.includes('odometry') ? 200 : 100;
          if (lastWriteTimes[msg.topic] && (now - lastWriteTimes[msg.topic] < minInterval)) {
            return;
          }
          lastWriteTimes[msg.topic] = now;

          const direction = msg.topic.includes('reference') ? 'DOWNLINK' : 'UPLINK';
          let summary = '';

          if (msg.topic === '/battery_state') {
            const v = msg.msg?.voltage ? msg.msg.voltage.toFixed(2) : 'N/A';
            summary = `Voltage: ${v} V`;
          } else if (msg.topic === '/mecanum_drive_controller/reference') {
            const lx = msg.msg?.twist?.linear?.x?.toFixed(2) || 0;
            const ly = msg.msg?.twist?.linear?.y?.toFixed(2) || 0;
            const az = msg.msg?.twist?.angular?.z?.toFixed(2) || 0;
            summary = `Cmd Twist: lx=${lx}, ly=${ly}, az=${az}`;
          } else if (msg.topic === '/imu/data_raw') {
            const ax = msg.msg?.linear_acceleration?.x?.toFixed(2) || 0;
            const ay = msg.msg?.linear_acceleration?.y?.toFixed(2) || 0;
            summary = `IMU Accel: x=${ax}, y=${ay}`;
          } else if (msg.topic.includes('odometry')) {
            const px = msg.msg?.pose?.pose?.position?.x?.toFixed(2) || 0;
            const py = msg.msg?.pose?.pose?.position?.y?.toFixed(2) || 0;
            summary = `Odom Position: x=${px}, y=${py}`;
          }

          insertLog({
            direction,
            topic: msg.topic,
            msg_type: msg.type || 'unknown',
            data: msg.msg,
            summary
          });
        }
      } catch (err) {
        // ignore parse errors
      }
    });

    rosWs.on('error', (err) => {
      console.warn(`[Topside Backend] ROS Bridge connection error: ${err.message}`);
    });

    rosWs.on('close', () => {
      console.log('[Topside Backend] ROS Bridge connection closed. Retrying in 5s...');
      setTimeout(connectRosBridge, 5000);
    });
  } catch (err) {
    console.error('[Topside Backend] Socket creation failed:', err.message);
    setTimeout(connectRosBridge, 5000);
  }
}

function startServer(portToTry) {
  const server = app.listen(portToTry, () => {
    console.log(`[Topside Web Server & API] Running on http://localhost:${portToTry}`);
    connectRosBridge();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Topside Backend] Port ${portToTry} in use, trying ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error('[Topside Backend] Server error:', err);
    }
  });
}

startServer(Number(PORT));
