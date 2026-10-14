# PE-441.5 — integración por rol preparada; aplicación adicional DEV pendiente

Se recuperó 5e8e3cc (PE437/439/440 integrado) sobre la rama DEV y se conectó el contrato definitivo de Tom, backend main 896a1dc3f3ab6fa37de58439024b168c2bb96c5a, migración 20261014040000 y edge v13 aplicadas DEV según entrega PE-441.4 comprobada.

| Criterio | Evidencia | Estado |
|---|---|---|
| 1 | [Ficha conjunta](evidence/pe441/criterion-1.md) | Verificada local: contraseña izquierda, código derecha también móvil; secretos ocultos, QR etiqueta, Applied sin Check Status. |
| 2 | [Estilos calculados](evidence/pe441/styles/results.json) | PASS: 30 observaciones, disabled nativo, gris legible, cursor default padre/hijos/hover; 10px entre botón y explicación en ambos roles/tamaños. Carga separada accesible; popover sonda CSS explícita y formulario real interceptado bloquea doble envío. |
| 3 | [Contrato UI/API](evidence/pe441/criterion-3.md) | UI y contrato base DEV verificados; guard adicional de versión malformada probado SQL local, pendiente aplicación DEV. |
| 4 | Repos subidos y handoff backend | Publicación pendiente de aplicación del guard. Destino vigente espejo dev-targets.json: playerp.dev, https://playerp.dev.bmore.app, / y /admin. No se leyó directamente coredeva.dev_target. |

`npm run build`: PASS. `npm test`: 241/241, 24 archivos. Pruebas Playwright con fixtures sintéticos y red externa interceptada; ninguna OTA real. No se operaron aparatos, secretos, promociones, grupos, PROD, Lovable ni fábrica.

Lily implementó pantallas y responsive. Gaby revisó en esta misma sesión, solo lectura: encontró validación de versión instalada inválida faltante en backend; revisó después 20261014050000 y dio sin hallazgos adicionales. La corrección mantiene gates, permisos y motor OTA; `_tests/pe441-installed-version/results.json` en backend contiene 19 casos locales reales PostgreSQL con dobles de autoridad/deploy.

Bloqueo concreto: MCP supabase_execute_sql y supabase_apply_migration, únicamente proyecto DEV, devuelven `MCP tool call requires approval, but approval policy is never`. Traspaso con migración ya en GitHub: backend docs/portal/PE-441.5-installed-version-handoff.md. Aplicar y comprobar guard DEV; después publicar este frontend con coredeva-publish playerp.dev <SHA>. No dar por publicada esta versión hasta retorno del conector y health 200 en ambas rutas.
