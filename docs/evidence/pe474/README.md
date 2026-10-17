# PE-474 — continuación frontend

Base `5ca83ed` de `uma/portal-dev-resume`. Dependencia backend aceptada: `06e6a7f` + `0bf0363`, contrato `_docs/pe474-contrato-ota-canales.md` §§1–7. No se ha cambiado backend, POS ni PROD.

- `tests.txt`: `npm test`, 339 pruebas en 35 suites. Incluye proyección lifecycle v2, promociones con identidad/revisión, General sin ACK, metadata inválida, canales/selector/permisos/concurrencia y páginas de una población sintética de 2000.
- `build.txt`: `npm run build`, TypeScript y Vite correctos. Permanece el aviso de tamaño del bundle.
- `browser-fixtures.json`: navegación con todas las llamadas Supabase interceptadas, listas grandes, promociones y conflictos simulados. No prueba criptografía del backend ni ejecución OTA física. Capturas `fixture-*`.
- `review-gaby.md`: revisión independiente y dos correcciones verificadas.

Las comprobaciones publicadas de DEV y la lista de red se añaden después de publicar mediante `coredeva-publish playerp.dev <SHA>`. El navegador real solo realiza lecturas; bloquea acciones de negocio y no guarda credenciales ni cabeceras de sesión.
