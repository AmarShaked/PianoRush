import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <div className="rotate-hint" role="alert">
      <div>
        <div className="rotate-icon" aria-hidden>
          ⟳
        </div>
        <p>Rotate your device to landscape to play Piano Rush.</p>
      </div>
    </div>
  </StrictMode>,
);
