import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/global.css';

function LittleApp() {
  return <div style={{ padding: 12, color: 'var(--fg)' }}>Little Vela</div>;
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <LittleApp />
    </StrictMode>,
  );
}
