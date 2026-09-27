import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { RepositoryProvider } from './data/RepositoryContext';
import { createDemoRepository } from './data/demoFixture';
import { createTauriRepository, isTauriAvailable } from './data/tauriRepository';
import './styles/global.css';

/**
 * In the desktop shell, data comes from SQLite via Rust. Opened in a plain
 * browser (`npm run dev:web`) there is no backend, so the demo fixture is served
 * from memory — useful for working on the UI, and clearly labelled in Settings
 * so preview data is never mistaken for the real notebook.
 */
const repository = isTauriAvailable() ? createTauriRepository() : createDemoRepository();

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <RepositoryProvider repository={repository}>
      <App />
    </RepositoryProvider>
  </StrictMode>,
);
