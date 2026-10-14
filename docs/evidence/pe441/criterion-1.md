# Criterio 1 — paridad visual local

Datos sintéticos, sin llamadas a servicios externos y sin secretos reales. Ficha compartida `PrintServerDevicePanel`, con `CredentialProgress` para estados.

| Ámbito | 390 px | 1440 px |
|---|---|---|
| OWNER | [Captura](styles/owner-390-credentials.png) | [Captura](styles/owner-1440-credentials.png) |
| ADMIN | [Captura](styles/admin-390-credentials.png) | [Captura](styles/admin-1440-credentials.png) |

Capturas con claves ocultas, SSID visible y operación Applied sin Check Status. A 390 se apilan los campos en orden lógico; a 1440 contraseña izquierda, código derecha y confirmaciones bajo código. Recorte de página completa sin desplazar la ficha bajo la cabecera fija.

[Resultado automatizado de mostrar/ocultar/copiar, legacy y QR](credentials/results.json): cuatro combinaciones OWNER/ADMIN × 390/1440 pasan; formato actual 5-5, formatos actuales equivalentes y legacy con guiones arbitrarios conservados, sin cambio de distribución al revelar. QR validado solo en preview/PNG de etiqueta, nunca lateral ni incluyendo código administrativo. Estados terminales dejan de consultar durante 120 s simulados; historial/fechas conservados.

La prueba de estilos también comprueba Applied sin botón en los cuatro escenarios. La autorización de API y publicación no se deducen de estas capturas: siguen pendientes.
