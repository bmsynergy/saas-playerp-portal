# Etiqueta de recuperación — complemento PE-411.3

**Backend confirmado y aplicado en DEV por Tom** en `f071571f82a50694648c395073560d2a5bfe8226`.
Este complemento consume el contrato acordado de credenciales confirmadas.
La publicación y su comprobación quedan registradas en la entrega de Uma.

Recorrido en DEV:
1. Entra en https://playerp.dev.bmore.app/admin/print-servers/inventory con tu cuenta autorizada
   y abre la ficha del aparato asignado. Como owner, abre Print Servers dentro de tu propio local.
2. Consulta o copia el código administrativo por separado, solo si figura confirmado. Ese código
   no se imprime y no forma parte de ningún QR. La activación de un uso es otro código diferente.
3. Abre la vista previa y descarga el PNG identificado por el serial. Si indica ausente/no verificado,
   no existe aún una etiqueta válida: no uses el ejemplo sintético para tu aparato.
4. Imprime desde el navegador a 50×30 mm y 100%/tamaño real, sin ajustar a página ni cabeceras/pies.
   Elige tú la impresora y el papel de etiquetas. El portal no envía nada directamente a una impresora.
5. La etiqueta indica: apagar/encender; conectar a la Wi-Fi indicada dentro de 90 segundos; introducir
   su contraseña; abrir http://10.77.0.1. La URL de recuperación es HTTP local.
6. Reimprime cuando cambie el SSID o contraseña **confirmados**. Mientras una rotación está pendiente
   o falla, el dato anterior confirmado sigue siendo el vigente; no imprimas valores futuros.

**Aparato legacy:** debe comprobarse físicamente identidad y vínculo al local. La lectura local
Wi-Fi autenticada no demuestra el código administrativo; necesitas acceso administrativo local
para verificar este último. El [acuerdo con Tom](https://github.com/bmsynergy/saas-playerp-backend/blob/f071571f82a50694648c395073560d2a5bfe8226/_docs/print-server/pe411-credenciales-confirmadas-y-conciliacion-legacy.md)
exige verificar el código iniciando sesión en la administración local HTTPS con la confianza
existente. Para Wi-Fi, leer `/api/wifi/recovery` con esa sesión y comprobar la conexión dentro
de 90 segundos tras encender, abriendo http://10.77.0.1. Sin copiar toda la configuración,
rotar claves ni cambiar hostname, CA o credencial técnica. El canal restringido de registro
requiere una RPC futura: este acuerdo no lo implementa ni ejecuta. El legacy sigue ausente
y con etiqueta bloqueada hasta que se registren las pruebas por ese canal. Mientras no se pueda
verificar un valor, permanece ausente. En este trabajo no se ha leído ni cambiado el PS real.

**Raspberry nueva:** crear y asignar inventario no instala el aparato. P13 sigue pendiente:
hace falta una base instalada compatible o un instalador inicial que no forma parte de esta pieza.
Con esa base preparada y la activación completada, pulsa por separado «Rotar Wi-Fi» y «Rotar código» en un aparato compatible y espera sus confirmaciones reales; el éxito del alta no basta
para marcarlos aplicados. No se ejecuta ni se programa ninguna rotación u OTA en este trabajo.

No se imprime QR en 50×30 mm para conservar espacio legible a los datos completos y los cuatro pasos.
El QR Wi-Fi ya existente permanece en pantalla solo con valores confirmados al revelar la clave.
El raster es 590×354 px, proporción 5:3, 300dpi (pHYs 11811). El redondeo equivale a 49.95×29.97 mm;
el diálogo usa 50×30 mm. El resultado sobre papel requiere la impresora y calibración de Beny.
