# Etiqueta PS 1.1.0 — pieza portal DEV

Base portal: cbd7c4a44e55c6cb69b2c7a9d267c1666ec331de, rama uma/portal-dev-resume.
Añade el código humano confirmado sin cambiar permisos, backend ni firmware. Stock usa ps_admin_stock_label. La ficha asignada une lecturas autorizadas del mismo aparato y exige coincidencia Wi-Fi y confirmación del código. Inventario usa sus credenciales confirmadas. Sin confirmación no hay etiqueta parcial; rotar requiere reimprimir. Los valores que no caben se rechazan sin truncar.

## Render ficticio EN/ES

`node tests/pe602-label.mjs`: 10 casos, 590×354 px, pHYs 11800, exactamente 50,00×30,00 mm. SSID una línea, contraseña ≥48 px y mantenimiento 24 px en fila independiente. QR abajo derecha, sin texto debajo ni invasión de zona silenciosa. Decodificación de solo Wi-Fi original y remuestreada a 203 dpi. Fixtures ficticios TEST1-TEST2 y 0123456789. Informe en label-report.json y PNG en este directorio. No acredita impresora ni cámara física.

`node tests/ps110-label-browser.mjs`: vista previa y descarga EN/ES, QR solo Wi-Fi, ausencia de código sin etiqueta parcial y bloqueo cuando el aparato no confirmó. Autenticación/backend interceptados con datos ficticios. No se imprime ni se opera un aparato.

## Acciones reales del código

Verificadas por lectura de ps-device/app/ps.py y ps-device/app/wifi/wifi_setup.py del firmware aprobado c64e946d6eb7a884fcae5374d6ce062f5d18c984; idénticos en main 1e7709172654b039a23833c3db0bf8a1b3a3d98b. Son capacidades del firmware, no permisos nuevos del portal.

- En el Wi-Fi de configuración: iniciar sesión local, consultar/buscar redes, probar y guardar una red, guardar una red destino para después sin cambiar la actual y volver a la red guardada. La red para después se intenta cuando la actual deja de estar disponible.
- En configuración: enviar/cancelar activación cuando corresponda; exige además su propio código de activación. Mantenimiento no asigna por sí solo un venue.
- En administración HTTPS local: ver estado, red, impresoras, colas y actividad; buscar impresoras; consultar Wi-Fi de recuperación; configurar Wi-Fi y cerrar sesión.
- Reiniciar con confirmación. Restablecer con confirmación explícita RESTABLECER: borra redes configuradas, nombre personalizado y asociaciones de impresoras propias y cancela trabajos pendientes; conserva venue, serial, identidad, hostname, certificados y credenciales iniciales. La convergencia del portal se completa al reconectar si estaba offline.
- En administración local: enviar trabajos de impresión y cancelar los aún en cola. Sin credencial cloud permite además agregar, renombrar y pausar/reanudar impresoras; en equipos integrados con PlayERP esas tres operaciones se rechazan localmente y se gestionan desde el portal.

No es una contraseña Wi-Fi, no autentica en portal/Supabase y no firma releases. El QR solo conecta al Wi-Fi. Ninguna acción se ejecutó sobre hardware. Las novedades 1.1.0 requieren instalar esa versión, responsabilidad de la pieza firmada y Beny.

## Publicación y reversión

Solo portal DEV, target playerp.dev por coredeva-publish tras subir el commit. Firmware, imágenes, migración, print-server y portal PROD pertenecen a pieza 2. Esta entrega no acredita su firma ni la provisión de SUPABASE_ACCESS_TOKEN.
Reversión DEV: publicar cbd7c4a44e55c6cb69b2c7a9d267c1666ec331de por el mismo conector. No revertir migración ni print-server preexistentes.
