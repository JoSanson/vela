import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/global.css';
import { LittleApp } from './LittleApp';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <LittleApp />
    </StrictMode>,
  );
}
