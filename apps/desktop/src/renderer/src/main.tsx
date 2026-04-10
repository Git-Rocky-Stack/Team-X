import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App.js';
import './styles/globals.css';

// Apply dark mode by default (matches CLAUDE.md design system: "dark by default").
document.documentElement.classList.add('dark');

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
