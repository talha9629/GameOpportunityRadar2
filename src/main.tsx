import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './integration.css';

const BUILD_VERSION_KEY = 'radar-installed-build-version';
let pwaRegistration: ServiceWorkerRegistration | null = null;
let pendingBuildVersion: string | null = null;

function showUpdatePrompt(version?: string) {
  if (version) pendingBuildVersion = version;
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
    'width:min(92vw,520px)',
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
    if (pendingBuildVersion) localStorage.setItem(BUILD_VERSION_KEY, pendingBuildVersion);
    button.disabled = true;
    button.textContent = 'Updating…';

    if (pwaRegistration?.waiting) {
      pwaRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }

    window.location.reload();
  });

  prompt.append(text, button);
  document.body.appendChild(prompt);
}

async function checkPublishedVersion() {
  try {
    const url = new URL('version.json', document.baseURI);
    url.searchParams.set('_', Date.now().toString());
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return;

    const payload = await response.json() as { buildId?: string };
    if (!payload.buildId) return;

    const installed = localStorage.getItem(BUILD_VERSION_KEY);
    if (!installed) {
      localStorage.setItem(BUILD_VERSION_KEY, payload.buildId);
      return;
    }

    if (installed !== payload.buildId) showUpdatePrompt(payload.buildId);
  } catch {
    // Version checks are best-effort; offline use should remain uninterrupted.
  }
}

async function registerPwa() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  try {
    const serviceWorkerUrl = new URL('sw.js', document.baseURI);
    const registration = await navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: './',
      updateViaCache: 'none',
    });
    pwaRegistration = registration;

    if (registration.waiting) showUpdatePrompt();

    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdatePrompt();
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    const checkForUpdates = async () => {
      await registration.update().catch(() => undefined);
      await checkPublishedVersion();
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void checkForUpdates();
    });
    window.setInterval(checkForUpdates, 60 * 60 * 1000);

    await checkForUpdates();
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
