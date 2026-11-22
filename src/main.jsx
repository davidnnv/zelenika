import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { LangProvider } from './lang';
import App from './App';
import './styles.css';
import './lib/pwa';

// The claude.ai preview can't serve sub-paths (/rezervacija, /admin), so it keeps the route in memory.
const Router = import.meta.env.VITE_PREVIEW === '1' ? MemoryRouter : BrowserRouter;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <LangProvider>
        <App />
      </LangProvider>
    </Router>
  </StrictMode>
);
