# PE-409.7 — cuatro comprobaciones focalizadas

Trabajo 846d1203-c823-41d6-a1cd-69b72cfccc8f. Entorno exclusivo DEV.
Los datos reales se consultaron el 12-oct-2026 con cuentas de prueba existentes.
Los fixtures son respuestas interceptadas en el navegador: no se insertan en
Supabase, no tienen credenciales ni datos personales reales y no operan aparatos.
La URL y el SHA publicado se registran en la entrega del trabajo.

## 1. Listas completas, filtros y estados

`node tests/pe409-read-live.mjs`: [registro real](reads.json), sin IDs duplicados
ni omitidos, orden fecha/ID descendente y agregados estables entre páginas.
El overview antiguo devuelve 50; las nuevas lecturas recorren lo siguiente:

| Lista real | Total | Páginas de 50 | Primera / última | 11-oct UTC |
|---|---:|---:|---:|---:|
| deployments | 167 | 4 | 50 / 17 | 6 |
| targets | 167 | 4 | 50 / 17 | 6 |
| audit | 202 | 5 | 50 / 2 | 9 |
| events | 1075 | 22 | 50 / 25 | 68 |
| printer queue | 114 | 3 | 50 / 14 | 0 |

Las cuatro lecturas OTA también comprobaron búsqueda vacía, filtro estado/acción
y fechas invertidas (22023). Las fechas son inclusivas por día UTC en pantalla y
límite superior exclusivo en la consulta. No se infiere fecha donde no existe.

`node tests/pe409-published.mjs` contra el candidato local y DEV real:
[registro por lista](candidate-real.json). Cada fila prueba búsqueda sin
coincidencias y reinicio a primera página. Se repetirá contra la URL publicada.

| Lista real en interfaz | Primera | Última | Páginas | Día 11-oct UTC |
|---|---|---|---:|---|
| tenants | 1–10 of 10 results | 1–10 of 10 results | 1 | Sin fecha disponible |
| staff | 1–5 of 5 results | 1–5 of 5 results | 1 | 0–0 of 0 results |
| dashboard | 1–10 of 103 results | 101–103 of 103 results | 11 | 1–4 of 4 results |
| fleet | 1–10 of 10 results | 1–10 of 10 results | 1 | 1–1 of 1 results |
| devices | 1–10 of 17 results | 11–17 of 17 results | 2 | 1–5 of 5 results |
| fw-releases | 1–10 of 20 results | 11–20 of 20 results | 2 | 1–3 of 3 results |
| fw-installed | 1–3 of 3 results | 1–3 of 3 results | 1 | Sin fecha disponible |
| editions | 1–10 of 18 results | 11–18 of 18 results | 2 | 1–3 of 3 results |
| groups | 1–7 of 7 results | 1–7 of 7 results | 1 | 0–0 of 0 results |
| ota-devices | 1–3 of 3 results | 1–3 of 3 results | 1 | 1–1 of 1 results |
| deployments | 1–10 of 167 results | 161–167 of 167 results | 17 | 1–6 of 6 results |
| audit | 1–10 of 202 results | 201–202 of 202 results | 21 | 1–9 of 9 results |
| venue-users | 1–1 of 1 results | 1–1 of 1 results | 1 | 0–0 of 0 results |

`node tests/pe409-lists.mjs`: [registro fixtures](fixtures.json), 18 listas de
63 filas: primera25/última13/3 páginas; cola10/3/7. Incluye destinos, eventos,
miembros de grupo e impresoras. Día UTC filtrado31 donde hay fecha; búsqueda
vacía, rango invertido y cambio de tamaño reinician la página. Estados cargando,
error y reintento se comprueban con respuestas demoradas/fallidas de las lecturas
principales y la cola. `npm test`: 90/90; `npm run build`: correcto.

## 2. Ámbito y autorización

El registro real prueba dos venues autorizados con respuesta200, venue exacto y
1/2 impresoras respectivamente; venue ajeno403/42501. Las cuatro lecturas OTA
niegan al owner403/42501. Los fixtures verifican las solicitudes y vista de dos
venues: solo su estado, sin flota/directorio global, búsqueda del segundo venue
sin resultados y sin metadatos/textos de otras sedes. El rol support no solicita
OTA y recibe vista denegada. Inventario global: All63/Assigned32/NotAssigned31;
los agregados no cambian al paginar. La interfaz con datos reales también verificó
que la lista de venue usa su lectura acotada.

## 3. Presentación y teclado

Ocho capturas de fixtures con textos largos EN/ES. Sin desbordamiento horizontal
de la página; campos y desplegables44px; notas, versiones y botones legibles.
En las cuatro combinaciones de idioma/ancho se abrió un modal existente, se
comprobó foco retenido con Tab, cierre Escape y devolución al botón inicial.
Nunca se confirmó la acción del modal.

| Ancho | Firmwares EN / ES | Eventos EN / ES |
|---|---|---|
| 390 | [EN](firmwares-390-en.png) / [ES](firmwares-390-es.png) | [EN](events-390-en.png) / [ES](events-390-es.png) |
| 1440 | [EN](firmwares-1440-en.png) / [ES](firmwares-1440-es.png) | [EN](events-1440-en.png) / [ES](events-1440-es.png) |

## 4. Eventos humanos, evidencia original y publicación

[Actualizaciones DEV](https://playerp.dev.bmore.app/admin/print-servers/updates).
Diagnóstico: abrir un despliegue, Eventos del destino y **Technical diagnostics /
Diagnóstico técnico**. El enlace de diagnóstico permanece en cada evento, bajo
la misma autorización de administrador; no existe un enlace público a datos OTA.
Las capturas anteriores muestran el control y la vista normal en ambos idiomas.
La prueba abre el diagnóstico del evento sintético0 y comprueba el detalle original.

| Fixture original | Vista EN | Vista ES |
|---|---|---|
| Evento2: phase=committed, status=committed, version=0.3.15, progress=100, detail={"message":"Application is healthy"}, 2026-10-10T23:59:59.999Z | Confirmed · Version0.3.15 · Result Confirmed · Overall progress100%, hora UTC y mensaje original | Confirmada · Versión0.3.15 · Resultado Confirmado · Progreso general100%, hora UTC y mensaje original |
| Evento1: phase=health_check, status=failed, error_code=health_failed, error_detail=Health check timed out, detail={"message":"Health check failed","error":"socket timeout"}, version=0.3.15, progress=100, 2026-10-11T23:59:59.999Z | Health check · Failed; ambos mensajes de error visibles | Comprobación de salud · Fallido; ambos mensajes de error visibles |
| Evento0: phase=future_phase, status=committed, detail={"updater_version":"1.0.0"}, version=0.3.15, progress=100, 2026-10-10T23:59:59.999Z | Unrecognized phase: future_phase; detalle técnico solo al abrir diagnóstico | Fase no reconocida: future_phase; detalle técnico solo al abrir diagnóstico |

El texto original del dispositivo se conserva en su idioma. Las etiquetas,
fases conocidas, resultados y mensajes de respaldo están traducidos. Un100%
global nunca se denomina descarga. No se cambia ningún evento almacenado.
Backend publicado antes del frontend dependiente: main
`3fc198028953922f11bee08f01d9e3e463cb39fd`, migración
`996e8b1df1055051d3fa55840d585fdc0182c896`, aplicada por Tom únicamente en
Supabase DEV `fzwzmwstxlsxdzdmphyq`. El SHA de portal y la comprobación de su
publicación se incluyen en entrega.md del trabajo, tras publicar el commit limpio.
