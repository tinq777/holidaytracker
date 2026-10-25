import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { announceUpdate } from './components/UpdateToast';
import './styles.css';

// A new deploy is installed in the background; the app then shows a toast with a Refresh button.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: () => announceUpdate(() => updateSW(true)),
  onRegisteredSW: (_url, reg) => {
    if (!reg) return;
    // Home Screen apps stay open for days, so check for new versions when reopened and every 30 minutes.
    const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }
});
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
