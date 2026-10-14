# PE-441.5 — comprobación conjunta de credenciales

Prueba: `PS_TEST_EVIDENCE=docs/evidence/pe441/credentials node tests/pe439-credentials.mjs`.

Capturas de la ficha compartida `PrintServerDevicePanel`, con credenciales ocultas y datos sintéticos, ninguna petición a aparatos reales:

| Vista | 390 px | 1440 px |
|---|---|---|
| OWNER | [Captura](credentials/owner-390-hidden.png) | [Captura](credentials/owner-1440-hidden.png) |
| ADMIN | [Captura](credentials/admin-390-hidden.png) | [Captura](credentials/admin-1440-hidden.png) |

SSID visible fila completa; contraseña izquierda y código actual oculto 5-5 a la derecha incluso en móvil; confirmaciones debajo. Mostrar/copiar conserva geometría; formato legacy exacto, incluidos guiones y 64 caracteres. QR solo en etiqueta. Applied no tiene Check Status. [Resultado conjunto](credentials/results.json), más estados Applied OWNER/ADMIN a ambos tamaños en [estilos](styles/results.json).

Estas capturas verifican la UI local final con toda la red externa interceptada. No afirman publicación ni autorización API viva.
