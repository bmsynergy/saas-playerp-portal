# Portal integral — preparación bloqueada, NO PUBLICAR

Work 1f128d8f-d110-43b0-b5c6-d2f870a85dea; complemento de PE-448.

Base funcional: `d9600d3d48402b3a48dde962a487d7ac2c0f7bfe` de `uma/portal-dev-resume`.
El 2026-10-14 la compilación de esta base reproduce byte a byte los assets de
https://playerp.dev.bmore.app: JS `index-C3cWXN1j.js`, SHA-256
`4bd777904431cb7e5983a14c29f69db9ee5a6272f6d164b84dc90ef775377607`; CSS
`index-Bczw8NUe.css`, SHA-256 `aff013653273b7ffb0e6168d80012fb0b6d56a93e319fa443351bca5f02134a5`.
`/version.json` devuelve el HTML SPA y no acredita un commit; la prueba son los assets.

`routes.json` contiene las 24 rutas declaradas, incluidas compatibilidad y fallback.
`direct-dependencies.json` contiene 53 RPC y 7 Edge Functions con llamadas y posibles
orígenes SQL; NO es lista de migraciones para aplicar. Incluye históricos, DOWN y SOLO DEV
para mostrar procedencia, nunca para seleccionarlos para PROD.
`edge-static-dependencies.json` añade 46 referencias literales RPC/tablas en los árboles de
las siete funciones. No certifica cierre transitivo, imports externos, RLS ni versión desplegada.
`branch-ancestry.json` fija las ramas remotas y si son ancestros de la base viva; las no
integradas no se incorporan por su nombre ni antigüedad. `refs.txt` conserva los SHAs.

Backend leído: `bmsynergy/saas-playerp-backend@518ccedab715c369d3628d73292478f496328791`.
POS leído sin checkout: `bmsynergy/playerp@bdda212a82932ba2a15f403663b3bd3909753234`.
Su HEAD no contiene migrations/functions; el commit histórico `82f64189f32ff5433ad4148dc8154a3382a09e4e`
retira las carpetas activas. El README del backend aún dice que manda el POS mientras AGENTS
sitúa las migraciones en `_migrations`; Tom debe confirmar la procedencia registrada actual.

## Validación local

- Base: `npm ci --ignore-scripts`, `npm run build`, `npm test`: build correcto, 289 tests.
- Candidato: `npm run build`, `npm test`: build DEV correcto, 295 tests en 30 archivos.
- Navegación local anónima: 48 comprobaciones entrada/recarga para 24 rutas; retorno de login
  conserva request_id sintáctico de consentimiento; sin errores JS. Red Supabase bloqueada.
- `npm run build -- --mode prod`: rechazo esperado por configuración PROD ausente.
- Usar exclusivamente `npm run build:prod` para PROD, con `SUPABASE_URL` exacta y
  `SUPABASE_PUBLIC_KEY` pública suministrada/verificada por Tom. `npm run build` mantiene DEV.
  El guard consulta solo Auth settings y rechaza una clave de otro proyecto, privilegiada o inválida.
- No hay artefacto PROD ni hash PROD. No se ejecutaron SQL/RLS ni pruebas remotas ni físicas.
- npm ci informa 8 vulnerabilidades (5 moderadas, 1 alta, 2 críticas); no se actualizó el lockfile.
  Falta evaluar su aplicabilidad al release antes de firma.

## SUBE FRONTEND

Solo candidato de configuración: build/dev-defaults.ts, build/portal-config.ts,
src/lib/{config,storage,access,supabase}.ts, vite.config.ts, vitest.config.ts,
package.json, tests/environment.test.ts y tests/route-smoke.local.mjs.
Se preservan todas las pantallas y tests de la base viva. No se publican DEV ni main.
Destino pretendido portal.playerp.net, URL Supabase https://uzzchmvinutuoygtziie.supabase.co,
auth storage playerp.portal.prod.auth; auxiliares playerp.portal.prod.*.
Clave pública PROD pendiente. Receta futura: compilar con build:prod, escanear artefacto
por referencias DEV y claves privilegiadas, registrar hash y verificar destinos con Tom.

## SUBE BACKEND

Ninguna migración seleccionada o preparada como aplicable: falta estado real PROD.
Tom debe contrastar los 53 RPC y sus dependencias, tablas, grants/RLS y firmas, y separar
lo cubierto por PE-448 de cualquier delta adicional de identidad, owners y staff.
No copiar `_solo_dev`, seeds, DOWN ni el histórico en bloque. Toda variante nueva necesita
número de trabajo, nombre exacto, pruebas aisladas y rollback compatible.

## SUBE FUNCIONES

Dependencias directas, NO lista autorizada de despliegue:
platform-staff-admin, invite-platform-staff, platform-identity-admin, owner-venue-users,
ps-ota-admin, ps-cert-admin, ps-firmware-admin. OAuth añade transitivamente mcp-analytics,
cuya versión/paquete debe fijar Tom en PE-448. Secretos permanecen exclusivamente backend.
No se presume versión vigente, verify_jwt ni compatibilidad por presencia en Git.

## BORRA O TRANSFORMA DATOS

Ninguna copia, borrado, sobrescritura ni corrección de identidades. Ningún cambio estructural
preparado sin comparación PROD. No se aplicaron migraciones ni se activó piloto MCP.

## FUERA

Publicación DEV/PROD, POS app.playerp.net, caja, ventas, dispositivos, colas, OTA operativa,
enrolamientos, rotaciones, pruebas físicas, rediseño y refactor general.

## Orden, infraestructura y rollback futuros (no ejecutables todavía)

1. Confirmar con Tom targets exactos y manifest compatible de PE-448, H1/F4 resueltos sin aceptación tácita.
2. Validar identidad owner y relación con Dynamic Park con SELECT, sin reparación.
3. Tras firma y en otro trabajo: backup/snapshot verificado; dependencias backend y funciones primero;
   permisos/contratos comprobados antes de montar frontend.
4. Auth allowlist aditiva para https://portal.playerp.net/auth/complete y
   https://portal.playerp.net/auth/password y variantes realmente usadas; conservar entradas existentes.
   Confirmar URLs de invitación/recuperación generadas por edges. No cambiar site_url global sin análisis.
5. DNS/TLS: Tom confirma proveedor, host y destino registrado; certificado de portal.playerp.net;
   servir SPA con fallback index.html para rutas de aplicación, y 404 para assets inexistentes.
   No modificar app.playerp.net. No hay receta de servidor ejecutable hasta conocer el target.
6. Abortar si falta cualquier dependencia, identidad/permiso, clave pública, prueba, hash, firma,
   cierre de riesgos, target registrado o verificación de ausencia de DEV en artefacto.
7. Rollback previsto: restaurar artefacto anterior compatible; si era primera publicación retirar el
   virtual host del portal según receta de Tom. Conservar esquema aditivo; no ejecutar DOWN destructivo
   ni revertir objetos compartidos con POS. Tom debe fijar hashes previos y compatibilidad antes de firma.

## Bloqueos y coordinación

`coredeva-leer PE-448` a 2026-10-14T12:48:26.599Z: `work_without_delivery`.
Plan de Tom: preparación aceptada, prepared_work_id `3b3a1935-941d-4981-8433-157b41eba1a9`.
No es un paquete ni una confirmación de Tom. Sin canal de mensajería de Tom/Telegram disponible.
La herramienta SQL rechaza el SELECT de PROD: `MCP tool call requires approval, but approval policy is never`.
No se intentó eludir esa aprobación. Identidad y permisos siguen sin comprobar.
No se solicita firma ni se presenta el conjunto como listo. El handoff de entrega.md pide el contraste
backend, targets y paquete exacto de PE-448; no cancela ni amplía su ejecución.
