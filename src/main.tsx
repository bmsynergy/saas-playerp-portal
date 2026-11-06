import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './hooks/useAuth';
import { LocaleProvider } from './locales';
import App from './App';
import './styles.css';

// Track input modality before React handles focus changes (dialogs and skip links included).
document.addEventListener('keydown', event => {
  if (!event.metaKey && !event.ctrlKey && !event.altKey && ['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
    document.documentElement.dataset.nav = 'keyboard';
  }
}, true);
document.addEventListener('pointerdown', () => { delete document.documentElement.dataset.nav; }, true);

const router = createBrowserRouter([{ path: '*', element: <AuthProvider><App/></AuthProvider> }]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><LocaleProvider><RouterProvider router={router}/></LocaleProvider></QueryClientProvider>
);
