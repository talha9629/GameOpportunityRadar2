import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './integration.css';

function showUpdatePrompt(registration: ServiceWorkerRegistration) {
  if (document.getElementById('pwa-update-prompt')) return;

  const prompt = document.createElement('div');
  prompt.id = 'pwa-update-prompt';
  prompt.setAttribute('role', 'status');
  prompt.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:calc(82px + env(safe-area-inset-bottom))',
    'transform:translateX(-50%)',
    'z-index:1000',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'max-width:min(92vw,520px)',
    'padding:10px 12px',
    'border:1px solid #315778',
    'border-radius:14px',
    'background:rgba(8,15,27,.97)',
    'box-shadow:0 16px 42px rgba(0,0,0,.35)',
    'color:#eaf8ff',
    'font:600 13px/1.35 system-ui,sans-serif',
  ].join(';');

  const text = document.createElement('span');
  text.textContent = 'A newer version of Radar is ready.';
  text.style.flex = '1';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Update now';
  button.style.cssText = 'min-height:42px;padding:8px 12px;border-radius:10px;border:1px solid #3b78a5;background:#15314a;color:#ecf8ff;font-weight:800;';
  button.addEventListener('click', () => {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      button.disabled = true;
      button.textContent = 'Updating…';
    } else {
      window.location.reload();
    }
  });

  prompt.append(text, button);
  document.body.appendChild(prompt);
}

async function registerPwa() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  try {
    const serviceWorkerUrl = new URL('sw.js', document.baseURI);
    const registration = await navigator.serviceWorker.register(serviceWorkerUrl, { scope: './' });

    if (registration.waiting) showUpdatePrompt(registration);

    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdatePrompt(registration);
        }
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    const checkForUpdate = () => registration.update().catch(() => undefined);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void checkForUpdate();
    });
    window.setInterval(checkForUpdate, 60 * 60 * 1000);
  } catch (error) {
    console.warn('[pwa] Service worker registration failed.', error);
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

void registerPwa();
