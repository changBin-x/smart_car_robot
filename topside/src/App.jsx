import React, { useState, useEffect } from 'react';
import { ThemeProvider, CssBaseline, Box, Container } from '@mui/material';
import { md3DarkTheme } from './theme/md3Theme';
import Navbar from './components/Navbar';
import DashboardView from './components/DashboardView';
import DebugConsoleView from './components/DebugConsoleView';
import DataQueryView from './components/DataQueryView';
import { rosService } from './services/rosbridge';

export default function App() {
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [connectionStatus, setConnectionStatus] = useState({ status: 'DISCONNECTED', url: rosService.url });
  const [telemetry, setTelemetry] = useState(rosService.telemetry);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    rosService.connect();

    const unsubscribe = rosService.subscribe((data) => {
      if (data.status) {
        setConnectionStatus({ status: data.status, url: data.url, error: data.error });
      } else if (data.type === 'TELEMETRY_UPDATE') {
        setTelemetry({ ...data.telemetry });
      } else if (data.type === 'TOPIC_MSG') {
        setMessages((prev) => [
          {
            topic: data.topic,
            direction: data.direction,
            message: data.message,
            timestamp: new Date().toLocaleTimeString()
          },
          ...prev.slice(0, 100)
        ]);
      }
    });

    return () => {
      unsubscribe();
      rosService.disconnect();
    };
  }, []);

  const handleReconnect = (url) => {
    rosService.connect(url);
  };

  return (
    <ThemeProvider theme={md3DarkTheme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          width: '100vw',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default',
          overflowX: 'hidden'
        }}
      >
        <Navbar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          connectionStatus={connectionStatus}
          rosUrl={connectionStatus.url || rosService.url}
          onReconnect={handleReconnect}
        />

        {/* Full-width responsive container filling viewport */}
        <Container
          maxWidth={false}
          disableGutters
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            px: { xs: 2, sm: 3, md: 4 },
            py: 3,
            width: '100%'
          }}
        >
          {activeTab === 'DASHBOARD' && <DashboardView telemetry={telemetry} />}
          {activeTab === 'DEBUG' && <DebugConsoleView messages={messages} />}
          {activeTab === 'QUERY' && <DataQueryView />}
        </Container>
      </Box>
    </ThemeProvider>
  );
}
