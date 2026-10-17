import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './hooks/useAuth';
import { LocaleProvider } from './locales';
import App from './App';
import './styles.css';

const router = createBrowserRouter([{ path: '*', element: <AuthProvider><App/></AuthProvider> }]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><LocaleProvider><RouterProvider router={router}/></LocaleProvider></QueryClientProvider>
);
