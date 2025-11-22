import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import setupLocatorUI from '@locator/runtime';
import App from './App.tsx';
import './index.css';

if (import.meta.env.DEV) {
  setupLocatorUI();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
