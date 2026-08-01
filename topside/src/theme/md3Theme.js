import { createTheme } from '@mui/material/styles';

export const md3DarkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#7cacf8', // MD3 Primary Cyan-Blue
      light: '#a8c7fa',
      dark: '#2563eb',
      contrastText: '#002e69'
    },
    secondary: {
      main: '#c5c6d0',
      light: '#e1e2ec',
      dark: '#44464f',
      contrastText: '#1b1b1f'
    },
    tertiary: {
      main: '#e8b9d5',
      contrastText: '#46263b'
    },
    background: {
      default: '#0f131a', // Surface Container Lowest
      paper: '#1a1f2c'    // Surface Container Low
    },
    surface: {
      container: '#212738',
      containerHigh: '#2a3144',
      containerHighest: '#333b52',
      outline: '#44474f'
    },
    status: {
      ok: '#4edea3',
      warn: '#ffb74d',
      error: '#ff897d',
      info: '#8ab4f8'
    },
    text: {
      primary: '#e2e2e9',
      secondary: '#90909a'
    }
  },
  typography: {
    fontFamily: '"Roboto", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif',
    h5: {
      fontWeight: 600,
      letterSpacing: '0.2px'
    },
    h6: {
      fontWeight: 600,
      letterSpacing: '0.15px'
    },
    subtitle1: {
      fontWeight: 500,
      letterSpacing: '0.1px'
    },
    body1: {
      fontSize: '0.95rem'
    },
    body2: {
      fontSize: '0.85rem'
    }
  },
  shape: {
    borderRadius: 16 // MD3 signature rounded corners
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.06)'
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 24, // Pill buttons for MD3
          textTransform: 'none',
          fontWeight: 600,
          padding: '8px 20px'
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500
        }
      }
    }
  }
});
