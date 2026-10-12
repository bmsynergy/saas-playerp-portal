# PE-409.7 — integración de listas de administración

Se retoma el checkpoint PE-409.5 sobre la base DEV
`a40a74c33cccf18d9a2f380f36ce62d31e8757a9`, conservando sus cambios.
El backend necesario dejó de estar pendiente: Tom versionó y aplicó solo en DEV
la migración `20261012010000_pe409_ps_admin_list_pages.sql` en el commit
`996e8b1df1055051d3fa55840d585fdc0182c896`; main verificado:
`3fc198028953922f11bee08f01d9e3e463cb39fd`.
Contrato definitivo: `_docs/pe409-read-contract.md` del backend.

Las lecturas paginadas de despliegues, destinos, auditoría y eventos sustituyen
el uso de las colecciones truncadas del overview. La cola conserva su RPC con
los filtros añadidos. El resto pagina las colecciones completas de sus lecturas
actuales. Los filtros de fecha indican su campo y usan días completos UTC;
las fechas invertidas no envían una consulta y los filtros reinician la página.

Las listas de venue consultan exclusivamente su estado y detalle, con cachés
por usuario y venue. Se han retirado de la vista las referencias a otras sedes.
No se alteran las reglas de identidad ni membresía. Los eventos se presentan
al leerlos, con fase, versión, resultado/error, hora y progreso general; sus
datos originales siguen bajo diagnóstico técnico con la autorización existente.

Validación focalizada reproducible:
- `npm test`: pruebas unitarias, incluidas fechas, parámetros y aislamiento.
- `npm run build`: TypeScript y compilación de producción.
- `node tests/pe409-read-live.mjs`: lecturas de datos existentes en DEV.
- `node tests/pe409-lists.mjs`: fixtures aislados de 63 filas, estados, filtros,
  paginación, aislamiento, capturas EN/ES a 390/1440 y teclado del modal.
- `node tests/pe409-published.mjs`: recorrido de solo lectura sobre el portal
  publicado; requiere las cuentas de prueba existentes fuera del repositorio.

Los scripts no crean despliegues, envían trabajos, firman paquetes ni operan
aparatos. La evidencia resumida y sin credenciales está en
[evidence/pe409](evidence/pe409/README.md). La entrega del trabajo registra el
SHA exacto publicado y la comprobación posterior sobre la URL de DEV.
