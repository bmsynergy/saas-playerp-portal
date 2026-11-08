# PE-607 — etiqueta nominal 50 × 30 mm, candidato DEV

Datos exclusivamente ficticios: PS-TEST607A, PlayERP-Setup-TEST607A y clave de diez dígitos de prueba. Ningún valor procede de la foto de Beny. Los PNG y el informe contienen únicamente estas fixtures.

- `label-es-canonical.png` / `label-en-canonical.png`: imagen final de 590 × 354 px, pHYs 11811 píxeles/metro (300 dpi). Este raster redondea a 49,95 × 29,97 mm; el CSS de impresión conserva el formato nominal exacto 50 × 30 mm.
- `actual-size.html`: presentación de los dos PNG a 50 × 30 mm CSS para inspección; el tamaño físico de una pantalla depende de su calibración. La prueba física se hace al 100 %, sin ajustar a página.
- `label-report.json` y `decode-output.txt`: una comprobación del PNG final para cada uno de cinco SSID ficticios en EN y ES: canónico22, ASCII32bytes, 32 caracteres escapables, 16 caracteres de2bytes y10de3bytes. Incluyen texto y métricas, pHYs, QR M, comparación de todos los píxeles del QR y sus4módulos blancos, margen18px, decode exacto con jsQR a300dpi y remuestreo suavizado400×240.
- QR canónico versión4: 6px/módulo, 0,508mm, aproximadamente4,06puntos a203dpi; caja con quiet zone246px ≈20,8mm. Se compacta la distribución, no se reduce ese QR físicamente. Versiones superiores usan5px (fixture escapable: v6). No se afirma exclusividad técnica de este tamaño ni escaneo térmico demostrado.
- Fuentes: SSID30px (hasta3líneas), clave44px; instrucciones16px y dirección22px en franja inferior. El caso de métricas que no caben bloquea con `label_does_not_fit`; no se recortan ni abrevían datos.
- `npm-test.txt` y `npm-build.txt`: salidas completas de las comprobaciones.

Reproducción: `npm ci`, iniciar `npm run dev -- --port 18799` en un puerto de pruebas autorizado, ejecutar `node tests/pe602-label.mjs`, `npm test` y `npm run build`; detener Vite al terminar. El test admite CHROMIUM_PATH para seleccionar Chromium instalado.

## Temporizador y límites de coordinación

Firmware leído, sin modificar, desde bmsynergy/saas-playerp-backend main `eddd73b45a29102857532e619739d7447d48191b`, `ps-device/app/wifi/wifi_setup.py`: línea358 fija90s si hay configuración guardada; líneas684–691 activan el AP antes de crear la ventana; línea817 abre el AP desde serve. Sin configuración guardada la ventana es ilimitada. La etiqueta prescribe conectarse dentro de90s desde que aparece Wi-Fi: no afirma que el arranque dure90s ni promete el cierre de una sesión ya conectada (que puede extenderse).

Se leyeron los planes PE-605/PE-606 durante esta sesión. La base del portal se comprobó con `git ls-remote`: fbb562df0d8463d6098cc786a114b0c51000bdd5. Este follow-up vive en `tomjr/pe607-etiqueta-ps-50x30`; no entra en `uma/portal-dev-resume`, no amplía el manifiesto cbbc9cc..fbb562d, no modifica firmware1.0.0 ni POS/venue, y no publica PROD. `printLabel` permanece idéntico byte por byte respecto a la base: mismo CSS50×30, misma ruta, sin nuevo escalado.

## Prueba física de Beny, pendiente

1. Abre https://playerp.dev.bmore.app/admin, entra con tu cuenta y abre la etiqueta de un Print Server que ya tenga sus credenciales confirmadas. Comprueba la vista previa en español y en inglés y descarga la imagen.
2. Imprime la etiqueta en papel de50×30mm desde la opción habitual. Selecciona tamaño real o100%, desactiva ajustar a página y confirma que no se recortan los bordes. Repite en203 y300dpi si dispones de ambas impresoras.
3. Comprueba que puedes leer completo el nombre de Wi-Fi, la clave y el número del aparato, y mide que la etiqueta conserve50×30mm.
4. Escanea la etiqueta impresa con el teléfono. Comprueba que propone exactamente la red y la clave del aparato, sin compartir fotografías que muestren credenciales.
5. En un aparato de prueba, apaga y enciende, conecta antes de90segundos desde que aparezca su Wi-Fi y abre http://10.77.0.1. Indica si escaneó y se leyó bien, junto con el modelo y la resolución de la impresora.

El decode digital y el remuestreo a203dpi son simulaciones: **el escaneo físico todavía no está demostrado**. El pase posterior a PROD queda fuera de este trabajo y requiere aprobación concreta con Tom tras PE-605.
