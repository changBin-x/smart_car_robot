import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbFile = path.join(__dirname, 'smartcar_telemetry_db.json');

let logs = [];
let nextId = 1;

// Load existing logs from JSON file on boot
function loadDb() {
  try {
    if (fs.existsSync(dbFile)) {
      const raw = fs.readFileSync(dbFile, 'utf-8');
      logs = JSON.parse(raw);
      if (logs.length > 0) {
        nextId = Math.max(...logs.map(l => l.id || 0)) + 1;
      }
    }
  } catch (err) {
    console.warn('[Db] Failed to load DB file, starting fresh:', err.message);
    logs = [];
  }
}

// Save logs to JSON file
function saveDb() {
  try {
    // Keep max 5000 records to keep JSON file lightweight
    if (logs.length > 5000) {
      logs = logs.slice(logs.length - 5000);
    }
    fs.writeFileSync(dbFile, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Db] Failed to save DB file:', err.message);
  }
}

loadDb();

export function insertLog({ direction, topic, msg_type, data, summary }) {
  const record = {
    id: nextId++,
    timestamp: new Date().toLocaleString(),
    direction,
    topic,
    msg_type,
    data: typeof data === 'string' ? tryParseJson(data) : data,
    summary: summary || ''
  };

  logs.push(record);
  saveDb();
  return record;
}

export function queryLogs({ startDate, endDate, topic, direction, search, limit = 50, offset = 0 }) {
  let filtered = [...logs];

  if (startDate) {
    filtered = filtered.filter(l => l.timestamp >= startDate);
  }
  if (endDate) {
    filtered = filtered.filter(l => l.timestamp <= endDate);
  }
  if (topic && topic !== 'ALL') {
    filtered = filtered.filter(l => l.topic === topic);
  }
  if (direction && direction !== 'ALL') {
    filtered = filtered.filter(l => l.direction === direction);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(l => 
      (l.topic && l.topic.toLowerCase().includes(q)) ||
      (l.summary && l.summary.toLowerCase().includes(q)) ||
      JSON.stringify(l.data || {}).toLowerCase().includes(q)
    );
  }

  // Reverse so newest logs appear first
  filtered.sort((a, b) => b.id - a.id);

  const total = filtered.length;
  const start = Number(offset);
  const end = start + Number(limit);
  const rows = filtered.slice(start, end);

  return {
    total,
    rows: rows.map(r => ({
      ...r,
      parsedData: r.data
    }))
  };
}

export function getTopicsList() {
  const topics = new Set(logs.map(l => l.topic));
  return Array.from(topics).sort();
}

export function getStats() {
  const totalLogs = logs.length;
  const uplinkCount = logs.filter(l => l.direction === 'UPLINK').length;
  const downlinkCount = logs.filter(l => l.direction === 'DOWNLINK').length;
  const latestLog = logs.length > 0 ? logs[logs.length - 1].timestamp : null;

  return {
    totalLogs,
    uplinkCount,
    downlinkCount,
    latestTimestamp: latestLog
  };
}

export function clearLogs() {
  logs = [];
  nextId = 1;
  saveDb();
  return { success: true };
}

function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
