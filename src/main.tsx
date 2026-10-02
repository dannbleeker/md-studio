import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerLaunchQueue } from './pwa/launchQueue';
import { registerPwa } from './pwa/registerPwa';
import { restoreDocumentHandle } from './services/documentActions';
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
void restoreDocumentHandle();
if (import.meta.env.PROD) registerPwa();
