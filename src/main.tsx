import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerLaunchQueue } from './pwa/launchQueue';
import { registerPwa } from './pwa/registerPwa';
import { registerStaleBuildHandler } from './pwa/staleBuild';
import { checkDiskChanges, restoreDocumentHandle } from './services/documentActions';
import './styles/tokens.css';
import './styles/app.css';
import './styles/editor.css';
import './mobile.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

registerLaunchQueue();
registerStaleBuildHandler();
void restoreDocumentHandle();
// Back from another app (or another device synced the folder): pick up
// changes made to the open file in the meantime.
window.addEventListener('focus', () => void checkDiskChanges());
if (import.meta.env.PROD) registerPwa();
