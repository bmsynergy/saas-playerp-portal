# PE-442.7 — demostración del consumidor del contrato final

Contrato final de Tom integrado: backend `cb94ecd215ae2d7ee7926efce9ed47171cba8d67`, aplicado solo DEV según traspaso PE-442.6. Se incorpora también la dependencia frontend PE441 existente `7f26647`. La publicación se acredita con el resultado de coredeva-publish en la entrega de PE-442.7.

`tests/pe442-lifecycle.mjs` recorre las pantallas reales del portal con todas las peticiones externas interceptadas. Los IDs `fixture-*`, `fixture-pe442@example.invalid` y las versiones `9.*` son datos sintéticos del navegador, no filas de Supabase. Las firmas exitosas y las retiradas son respuestas simuladas, no evidencia criptográfica, de auditoría persistida ni de resultado físico. Los grupos fixture están vacíos. El script prohíbe cualquier acción OTA distinta de `sign` simulado y bloquea la red externa (también las fuentes).

Para repetir en un puerto de pruebas autorizado:

```sh
npm ci --no-audit --no-fund
npm run dev -- --port 18799 --strictPort
# En otra terminal; detener Vite al terminar.
node tests/pe442-lifecycle.mjs
```

Una demostración por cada combinación EN/ES y 390/1440:

1. Catálogo con 28 releases, páginas 25/3 y filtro de retiradas; agregado instalado de 4 aparatos por versión, sin sumar las coincidencias de dos revisiones.
2. Confirmación de hash, versión, modelo, arquitectura y revisión; respuesta simulada `release_changed`; después firma simulada que no habilita anillos.
3. General bloqueado con la explicación de confirmación Canary real pendiente; lab_only no habilita Canary; contrato ausente no permite acciones.
4. Habilitar Canary de la edición heredada fixture 1, abrir Updates y comprobar que aparece en el selector; volver por enlace exacto a Firmwares y retirar; deja de ser seleccionable.
5. El historial de esa misma edición fixture 1 permanece idéntico antes/después de retirarla, conserva su ID de edición retirada y enlaza al detalle exacto. Enlace a edición fuera de la primera página y rechazo de sustitución por release si la edición solicitada no existe.
6. Discrepancia de hash de archivo local frente a finalize simulado; ambos hashes visibles. Retirada bloqueada por operación en curso muestra mensaje distinto de Eliminar. Fallo 503 al refrescar no deja controles lifecycle de la caché.

Resultado automático: `checks.json`. Capturas: `confirmation-changed-*`, `signed-general-blocked-*`, `retired-history-*`, `hash-mismatch-*`. No contienen claves privadas ni credenciales reales.

Complementos: `npm test` (269 pruebas) incluye la proyección fail-closed (`firmwareLifecycle.test.ts`) y la regresión PE416 de su API existente; `npm run build` verifica TypeScript y compilación. Estos resultados **no cubren** autorización/compatibilidad/anti-replay del servidor, migración, gate canary vivo ni publicación. La conservación comprobada aquí es la del historial fixture en el consumidor; la comparación de filas/manifiestos/firmas corresponde al traspaso de Tom.

Contrato servidor revisado en esta reanudación (no ejecutado de nuevo): [52 casos SQL](https://github.com/bmsynergy/saas-playerp-backend/blob/cb94ecd215ae2d7ee7926efce9ed47171cba8d67/_tests/pe442-lifecycle/salida-contrato-dev.txt) y [12 comprobaciones API](https://github.com/bmsynergy/saas-playerp-backend/blob/cb94ecd215ae2d7ee7926efce9ed47171cba8d67/_tests/pe442-lifecycle/salida-edge-dev.txt). La firma positiva SQL es ficticia y la oferta positiva no se firma y se revierte; no se atribuye resultado físico a esos casos.
