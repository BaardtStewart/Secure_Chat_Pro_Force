import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const style = document.createElement('style');
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Rajdhani:wght@600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; -webkit-tap-highlight-color: transparent; }
  ::-webkit-scrollbar { width: 3px; height: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #2A2A3A; border-radius: 3px; }
  .pf-input, .pf-textarea { transition: border-color 0.15s, box-shadow 0.15s; }
  .pf-input:focus, .pf-textarea:focus { border-color: #C41230 !important; box-shadow: 0 0 0 3px rgba(196,18,48,0.15); }
  .pf-input::placeholder, .pf-textarea::placeholder { color: #8A8AA0; opacity: 0.7; }
`;
document.head.appendChild(style);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
