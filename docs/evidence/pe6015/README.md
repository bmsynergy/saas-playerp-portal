# PE-601.5 — portal DEV, preparación por Wi-Fi

Base: uma/portal-dev-resume, PE-600 307011e. El backend no se modifica.

- `contract.json`: lecturas reales DEV. Inventario de prueba PS-CUHBV6EJ pendiente; consultas repetidas iguales y etiqueta denegada. Owner y usuario tenant reciben forbidden en reservas, estado y etiqueta. PS-5EASG93M se lee sin pedir reservas ni modificarlo: file_issued y mismo archivo vigente.
- `image.json`: hash calculado sobre los 615589060 bytes descargados del catálogo DEV, imagen 0.3.28.
- `unit.txt`, `build.txt`: regresión 433/433 y compilación.
- `published.json` y `published-*.png`: portal publicado, commit dfdd7382becce49b73a18fd4895f18df6a1da913, asset index-YiUJmZAo.js. Las credenciales de prueba se ocultan en las capturas, no en el producto. Capturas de panel ocultan solo la barra fija para evitar que tape el contenido al capturar una sección mayor que la ventana.

No hay prueba de hardware. Firmware/radio/bootstrap pertenecen a PE-601.4; esta pieza verifica UI y contratos contra DEV real. No se regeneró ningún archivo ni se envió correo ni OTA. El primer intento de login de venue_manager devolvió 400; se usó la cuenta de prueba vigente venue_frontdesk. Un intento local coincidió con hot reload de traducciones; la repetición estable pasó sin errores.

Revisión de Gaby, solo lectura en esta sesión: sin hallazgos; contrato, diff, permisos, huellas y 433 pruebas en verde. Gaby revisó también las cuatro capturas y published.json tras publicar: sin hallazgos. Revisó entrega.md y confirmó la instrucción SD y la separación de la prueba física pendiente.

`states.json`: comprobación adicional publicada. Fixture confirmado real de DEV oculta reservas pendientes y habilita etiqueta; denegación RPC simulada oculta valores y bloquea etiqueta; owner vuelve a su inicio y frontdesk ve acceso denegado. Los primeros intentos de esta prueba esperaban un mensaje común, pero cada rol tiene un guard distinto; la aserción final comprueba ambos contratos existentes.
