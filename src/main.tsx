import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles/index.css';

async function boot() {
  // Development-only sample backend (`npm run dev`, then open with ?mock). Removed from production builds.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) await import('./dev/mockBackend');
  else registerSW({ immediate: true }); // installs the offline app shell and picks up new versions
  const { default: App } = await import('./App');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void boot();
