import { defineConfig } from 'vitest/config';
import { resolvePortalConfig } from './build/portal-config';
export default defineConfig({define:{__PORTAL_CONFIG__:JSON.stringify(resolvePortalConfig({}))},test:{include:['tests/*.test.ts']}});
