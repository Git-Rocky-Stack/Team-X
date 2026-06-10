import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';

import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/public-sans';
import '@fontsource/iosevka';
import './styles/fonts/departure-mono.css';

import App from './App.js';
import { queryClient } from './lib/query-client.js';
import './styles/globals.css';

// Apply dark mode by default (matches CLAUDE.md design system: "dark by default").
document.documentElement.classList.add('dark');

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
