# PE-607 — nueva distribución aprobada, 50 × 30 mm

Datos exclusivamente ficticios: PS-TEST607A, PlayERP-Setup-TEST607A y clave 0123456789. Ningún valor procede de un aparato real ni de la foto de Beny.

- `label-es-canonical.png` / `label-en-canonical.png`: salida del generador compartido por vista previa, descarga e impresión; 590 × 354 px, pHYs 11800 píxeles/metro, exactamente 50 × 30 mm (299,72 dpi, nominal 300 dpi). Blanco y negro puros, margen de tinta de 20 px.
- `label-report.json` y `decode-output.txt`: cinco SSID en cada idioma: canónico, 32 ASCII, 32 escapables, UTF-8 de dos y tres bytes. SSID íntegro en una línea, fuente 38 a 24 px; clave negrita 52 px. Si no cabe a 24 px se devuelve `label_does_not_fit`.
- Cabecera PlayERP y serial; Wi-Fi y SSID al ancho útil. Columna inferior izquierda: Password/Clave, clave, dos instrucciones breves y URL; QR a la derecha sin texto debajo. El borde inferior negro del QR queda a no más de 4 px del borde inferior de la URL.
- QR canónico M versión 4: negro 165 px (28 % del raster), 33 módulos de 5 px; con zona blanca, 205 px ≈17,37 mm. Cada módulo mide 0,424 mm, unos 3,39 puntos a 203 dpi. La zona blanca de cuatro módulos alcanza los bordes derecho e inferior. El caso escapable usa módulos de 4 px. Se compara cada píxel del QR y su zona blanca con una matriz independiente y se decodifica el payload exacto con jsQR a resolución original y en remuestreo suavizado 400×240 (simulación 203 dpi).
- `actual-size.html`: los PNG a 50 × 30 mm CSS; la pantalla necesita calibración. `printLabel` conserva exactamente su CSS `@page` 50×30 mm y la misma imagen compartida; no se ha hecho una impresión física ni una prueba de diálogo de impresión.
- `npm-test.txt` y `npm-build.txt`: salidas finales de tests y build. Los tests existentes verifican confirmados frente a reservados y autorización de credenciales.

Reproducción: `npm ci`, iniciar `npm run dev -- --port 18799 --strictPort` en un puerto de pruebas autorizado, ejecutar `node tests/pe602-label.mjs`, `npm test` y `npm run build`; detener Vite al terminar. `CHROMIUM_PATH` permite seleccionar Chromium instalado.

El nuevo commit es hijo directo de 67ae5a8, en la misma rama `tomjr/pe607-etiqueta-ps-50x30`. Sustituye el diseño anterior y conserva su paso de idioma en los tres componentes. En `src` solo cambia el generador; `validLabel`, `labelDataFromSheet` y `printLabel` quedan idénticas. Sin cambios de firmware, timeout, backend, datos reales ni POS. La publicación DEV y el avance por fast-forward de `uma/portal-dev-resume` se documentan en la entrega. PROD es la pieza siguiente, por el carril oficial con firma de ESTE cambio; no requiere repetir el GO conversacional.

## Prueba física de Beny pendiente

1. Abre https://playerp.dev.bmore.app/admin con tu cuenta y mira la etiqueta de un aparato que ya tenga Wi-Fi confirmado. Comprueba la vista previa en español e inglés y descarga la imagen sin compartir sus credenciales.
2. Imprime desde la opción habitual en papel de 50×30 mm al 100 %, sin ajustar a página. Comprueba los bordes y que el nombre de red, la clave y el número del aparato se leen completos.
3. Escanea la etiqueta impresa con el teléfono y comprueba que propone la red correcta. Indica si escanea bien y el modelo y resolución de la impresora; prueba 203 y 300 dpi si dispones de ambas.

El decode digital y el remuestreo no garantizan el escaneo térmico: **el escaneo físico no está demostrado**. El QR canónico se ha reducido de 6 a 5 px por módulo conforme al diseño aprobado; Beny debe comprobar el resultado en papel. No se ejecutó `tests/ps-label-browser.mjs`, fuera del alcance de esta pieza.
