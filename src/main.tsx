import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { DesktopApp } from './app/DesktopApp';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <DesktopApp />
  </StrictMode>,
);
