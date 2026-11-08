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

// Offline-first (PRD §15): the service worker caches the whole game after the first visit.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
