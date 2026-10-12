# PE-411 — verificación al retomar el 12-oct-2026

Frontend recuperado desde `067515fc`, descendiente de la base DEV `9df27e4`.
Revalidación HTTP antes de cambios: SHA-256 del HTML
`4fc654eaa9da305e83a95aae6d3a5208cfcb8a62be31f2f5d3fd480e4c9a713c` (sin cambio).
GitHub backend main revalidado con `git ls-remote`: `f071571f82a50694648c395073560d2a5bfe8226`.
Entrega oficial de Tom leída por `coredeva-leer PE-411.4`, artefacto
`f12fec47-67f6-490b-ac13-4162fadc9a4b`, SHA-256 `07e042cb13556ad85557e0630b57f82bd553b66def1da210f75a95231264618a`:
contrato aplicado en DEV, 26/26 fixtures server-side con rollback, legado ausente y acuerdo escrito.
Esta sesión no repite sus mutaciones ni opera aparatos.

Comprobaciones repetidas sobre esta integración:
- Build correcto, solo aviso heredado del tamaño del bundle.
- 25/25 pruebas focalizadas de etiqueta, API e inventario.
- Navegador: 390/1440, mostrar/ocultar/copiar, alta/asignación simulada, pérdida de permiso,
  relectura antes de exportar y cambio de aplicado invalida; cero errores. Las capturas se regeneraron.
- Raster y composición comprobados: 590×354, pHYs 11811 por eje, blanco/negro, margen mínimo 18px,
  serial completo y SSID sintético máximo; CSS/PDF 50×30mm. PNG inspeccionado visualmente.
- Gaby, en esta sesión, solo lectura: sin hallazgos funcionales; dos textos de estado desactualizados
  corregidos en la ayuda y el contrato. El acuerdo conserva la propuesta original como antecedente.

Las capturas usan respuestas sintéticas interceptadas y NO prueban por sí solas autorización real.
La evidencia server-side corresponde a Tom; la publicación se verifica en la entrega de Uma.

---

## Registro de la preparación anterior (conservado como historial)

# PE-411.3 — comprobación focalizada del complemento

**Solo fixtures sintéticos locales. No acredita permisos server-side, acuerdo legacy ni publicación DEV.**
Base servida revalidada 12-oct-2026: `9df27e403f248d1ae7f605956eedc9bde2fe1e19`;
HTML remoto y release local coinciden SHA-256 `4fc654eaa9da305e83a95aae6d3a5208cfcb8a62be31f2f5d3fd480e4c9a713c`.
`/version.json` y `/release.json` devuelven fallback SPA, no se usaron como prueba de SHA.
Backend main leído `0377126`, sin modificación. Contrato y traspaso: ../../print-server/pe411-backend-contract.md.

- `npm run build`: correcto. Aviso de tamaño de bundle Vite (>500kB), sin error de compilación.
- `npm test -- --run tests/psLabel.test.ts tests/printServerApi.test.ts tests/printInventory.test.ts`: 25/25.
- `node tests/ps-label-browser.mjs` con Vite en 18799: checks.json, 0 errores. Intercepta toda solicitud
  externa; ninguna llega a Supabase. Alta/asignación simuladas; valores nunca son de un PS real.
- `composition.json`, PNG y PDF: SSID 32 bytes, serial 11 caracteres, campo completo sin elipsis;
  PNG 590×354 (5:3 exacto), pHYs 11811/11811 por metro (=299.9994 dpi), píxeles negros/blancos
  opacos, límites de tinta x=18..571, y=21..323. 18 px =1.524 mm a 300dpi. Raster mide aprox
  49.95×29.97 mm; impresión CSS redondeada 50×30 mm. Pasos 22px =5.28pt, datos 24–26px.
- `sheet-390.png`, `sheet-1440.png`, `legacy-absent-es-390.png`: sin desbordamiento de viewport,
  mostrar/ocultar/copiar y preview; cambios aplicados reocultan y bloquean exportar el anterior;
  pérdida de permiso borra valores/vista previa. PDF y medición CSS comprueban escala física
  nominal; calibración/legibilidad sobre el papel real quedan a Beny con su impresora.
- Revisión visual de Uma: campos completos, márgenes y contraste correctos. QR solo en pantalla;
  se omite en etiqueta para dar espacio a SSID de 32 bytes y 4 pasos legibles, sin rediseñar marca.
- Gaby, lectura independiente en esta sesión: un hallazgo menor (un frame visible al cambiar
  valores revelados) corregido ligando visibilidad a identidad/valores durante render; segunda
  revisión confirma corrección y ningún nuevo hallazgo frontend. Backend no certificado.

Los archivos muestran secretos **sintéticos**: 0123456789 y ABCD234567 no pertenecen a nadie.
Ejemplo descargable del mismo generador: public/examples/PS-XXXXXXXX-50x30mm.png.
El ejemplo es para revisar composición, no para pegarlo en un aparato real.
