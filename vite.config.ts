import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolvePortalConfig, verifyPublicKey } from './build/portal-config';
export default defineConfig(({ mode }) => {
  const config = resolvePortalConfig({ ...loadEnv(mode, process.cwd(), ''), ...process.env }, mode);
  return {
    define: { __PORTAL_CONFIG__: JSON.stringify(config) },
    plugins: [react(), { name: 'portal-project-guard', async buildStart() { await verifyPublicKey(config); } }],
    server: { port: 18791, strictPort: true }, preview: { port: 18791, strictPort: true },
  };
});
