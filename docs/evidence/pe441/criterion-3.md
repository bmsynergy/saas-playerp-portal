# PE-441.5 — contrato por rol

`npm test`: 241 pruebas en 24 archivos; `tests/pe441FirmwareRoles.test.ts` aporta 19 casos OWNER/ADMIN, incluidas negativas con cero llamadas y versión lab con sufijo. `node tests/pe441-roles.mjs`: confirmación y mensajes en OWNER/ADMIN 390/1440, todas las llamadas externas interceptadas. [Salida UI](roles/results.json).

OWNER conserva latest_stable solo General y respeta can_update del servidor; no_general_update se muestra exactamente «No hay actualizaciones publicadas en General para este equipo». STAFF lector no adquiere escritura. El POST propietario lleva venue, aparato, edición y versión instalada vista; relectura antes de confirmar. ADMIN usa candidate/effective_ring, ve newest_signed inadmitido y 0.3.21 sin confirmación canary; la confirmación lleva edición/instalada al deploy autorizado.

Backend de Tom aplicado DEV: 896a1dc3f3ab6fa37de58439024b168c2bb96c5a; evidencias versionadas `_tests/pe441-ota-por-rol/salida-contrato.txt` y `salida-edge.txt`. La API rechaza OWNER signed no General 409, destino ajeno 403, acción ADMIN 403; 51/51 ofertas y despliegues antes/después. Versión no mayor y STAFF cubiertos SQL. El caso STAFF API fue omitido por falta de sesión; no se presenta como probado por API.

Gaby encontró después una versión instalada malformada que backend trataba como cero. Corrección adicional 20261014050000 en rama backend `uma/pe441-installed-version-guard`; 16 negativas de estado/acción sin ofertas y 3 positivas con dobles en PostgreSQL local, `_tests/pe441-installed-version/results.json`. Gaby revisó el arreglo sin nuevos hallazgos.

**Criterio pendiente de cierre DEV:** ambas herramientas MCP de consulta/aplicación rechazaron automáticamente el permiso en esta sesión. El guard adicional está versionado y probado localmente, todavía no aplicado. No se lanza ninguna OTA real ni se promueve una edición.
