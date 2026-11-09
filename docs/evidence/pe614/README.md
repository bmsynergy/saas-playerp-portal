# PE-614 — EN/ES, DEV

Frontend verificado: `939e41d0a3621c65f3ee06b910f199a988fcf1e3`, en
https://playerp.dev.bmore.app, 9 de noviembre de 2026, 02:05–02:06 UTC.
Estas capturas y reportes usan el frontend publicado con respuestas sintéticas
interceptadas de Auth/API. No prueban autorización real ni escriben en el backend.
Los nombres de personas, locales, casos, números de serie y direcciones son datos
ficticios conservados sin traducir. Los controles nativos de fecha siguen el idioma
del navegador; las fechas y números presentados por el portal siguen EN/ES.

1. **Cobertura:** barrido de 121 fuentes y 2474 claves, sin literales traducibles
   pendientes identificados ni claves visibles en las vistas probadas. Incluye
   Personal, Soporte, instalación/entrega, estados técnicos y mensajes persistentes.
   Gaby revisó el diff en modo lectura, señaló huecos del detector y estados crudos;
   todos se corrigieron y confirmó que no quedan hallazgos pendientes.
2. **Control sostenible:** `npm run check:i18n` y `npm run build` pasan. El build
   ejecuta el control de diccionarios/literales. `npm test`: 53 archivos, 476 pruebas
   aprobadas; después del ajuste final AI→IA, `npx vitest run tests/i18n.test.ts`:
   9/9 y compilación aprobados. Las regresiones inyectan claves ausentes, parámetros
   incompatibles, textos en JSX/diálogos, metadatos y traducciones congeladas.
3. **Navegador:** [reporte del portal](portal-report.json), 11 comprobaciones;
   [reporte de dispositivos](device-report.json), 8 vistas y 12 estados. Ambos PASS,
   sin errores JS, llamadas inesperadas ni desbordamiento horizontal a 390/1440 px.
   Cambio sin recarga, persistencia al navegar/recargar/alternar Owner–Admin,
   fechas/números localizados, confirmaciones de Personal, Soporte vacío/error/éxito,
   rol de soporte y estados futuros con fallback localizado. Uma inspeccionó las
   ocho capturas seleccionadas abajo.
4. **Alcance:** commits de Uma en `bmsynergy/saas-playerp-portal`, rama
   `uma/portal-dev-resume`; publicación exclusiva mediante el destino `playerp.dev`.
   `/` y `/admin` respondieron HTTP 200. No hay cambios en permisos, contratos de
   datos, lógica de negocio, backend, Lovable ni producción.

| Superficie | Inglés | Español |
|---|---|---|
| Personal, Admin | [1440 px](staff-1440-en.png) | [390 px](staff-390-es.png) |
| Soporte, Owner | [390 px](owner-support-390-en.png) | [1440 px](owner-support-1440-es.png) |
| Dispositivo, Admin | [1440 px](admin-en-1440.png) | [390 px](admin-es-390.png) |
| Dispositivo, Owner | [390 px](owner-en-390.png) | [1440 px](owner-es-1440.png) |

Reproducción (desde el repositorio, con Chromium disponible):

```sh
npm test
npm run build
PORTAL_TEST_ORIGIN=https://playerp.dev.bmore.app node tests/i18n-browser.mjs
PORTAL_TEST_ORIGIN=https://playerp.dev.bmore.app node tests/i18n-device-browser.mjs
```
