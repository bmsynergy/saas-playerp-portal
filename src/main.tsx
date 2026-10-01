import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './hooks/useAuth';
import { LocaleProvider } from './locales';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><LocaleProvider><BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter></LocaleProvider></QueryClientProvider>
);
