import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createQueryClient } from './lib/queryClient';
import './index.css';

async function start() {
  if (import.meta.env.VITE_MOCK === 'true') {
    // Dynamic import keeps the mock backend out of the production bundle.
    const { enableMocking } = await import('./mocks/browser');
    enableMocking();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App queryClient={createQueryClient()} />
    </StrictMode>,
  );
}

void start();
