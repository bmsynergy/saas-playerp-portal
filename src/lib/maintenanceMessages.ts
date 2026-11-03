// PE-569.3 — CATALOGO COMUN DE TEXTOS DEL MANTENIMIENTO DIARIO (ES / EN).
//
// Traduce AL MOSTRAR lo que system-maintenance y scheduled_job_runs guardan en
// crudo (codigos de tarea, codigos de error, el JSON de error de la noche) a
// frases legibles. Lo guardado no cambia: esto solo se usa para pintar.
//
// TypeScript puro y SIN imports. Este es el ORIGINAL; hay copias EXACTAS (mismo
// sha256) en:
//   - send-venue-owner-notice/functions/_shared/maintenance-messages.ts (correo
//     de alerta system_maintenance_missed, plantilla platformMaintenanceAlert)
//   - src/lib/maintenanceMessages.ts del portal (bmsynergy/saas-playerp-portal)
// Misma convencion que portal-email.ts: se edita aqui y se copia tal cual.
//
// Dar de alta una tarea = anadir su entrada en MAINTENANCE_TASK_NAMES y copiar
// el fichero. Una tarea sin entrada se muestra con su codigo.

export type MaintenanceLocale = "es" | "en";

const loc = (l: unknown): MaintenanceLocale => (l === "en" ? "en" : "es");

/** Nombre legible de cada tarea del mantenimiento diario. */
export const MAINTENANCE_TASK_NAMES: Record<string, { es: string; en: string }> = {
  pos_card_stale: { es: "Cobros con tarjeta a medias", en: "Half-finished card payments" },
  pos_quotes_expire: { es: "Cotizaciones sin cobrar caducadas", en: "Expired unpaid quotes" },
};

/** Nombre legible de una tarea; sin entrada en el catalogo, su codigo. */
export function maintenanceTaskName(key: string, locale: MaintenanceLocale = "es"): string {
  const e = Object.prototype.hasOwnProperty.call(MAINTENANCE_TASK_NAMES, key) ? MAINTENANCE_TASK_NAMES[key] : null;
  return e ? e[loc(locale)] : key;
}

/** Etiquetas sueltas que comparten portal y correo. */
export const MAINTENANCE_LABELS = {
  es: {
    technicalDetail: "Detalle técnico",
    showTechnicalDetail: "Ver detalle técnico",
    notApplicable: "No aplica",
    allTasksOk: "Todas las tareas terminaron bien",
  },
  en: {
    technicalDetail: "Technical detail",
    showTechnicalDetail: "Show technical detail",
    notApplicable: "Not applicable",
    allTasksOk: "All tasks finished correctly",
  },
} as const;

/**
 * Frase resumen de una noche o de un intento, en lugar del JSON
 * {"failed_tasks": [...]}: «Falló 1 de 2 tareas: Cotizaciones sin cobrar
 * caducadas» / «1 of 2 tasks failed: Expired unpaid quotes».
 * null si no fallo ninguna tarea (o no hay tareas).
 */
export function maintenanceFailureSummary(
  failedKeys: readonly string[],
  totalTasks: number,
  locale: MaintenanceLocale = "es",
): string | null {
  const keys = Array.isArray(failedKeys) ? failedKeys.filter((k) => typeof k === "string" && k !== "") : [];
  const failed = keys.length;
  if (failed === 0) return null;
  const total = Math.max(Number.isFinite(totalTasks) ? Math.trunc(totalTasks) : 0, failed);
  const l = loc(locale);
  const names = keys.map((k) => maintenanceTaskName(k, l)).join(", ");
  if (l === "en") return `${failed} of ${total} ${total === 1 ? "task" : "tasks"} failed: ${names}`;
  return `${failed === 1 ? "Falló" : "Fallaron"} ${failed} de ${total} ${total === 1 ? "tarea" : "tareas"}: ${names}`;
}

export type MaintenanceErrorKind =
  | "timeout"
  | "permission"
  | "stripe"
  | "sale_not_closed"
  | "owner_notice"
  | "database"
  | "unexpected";

/** Frase de cada tipo de error conocido. */
export const MAINTENANCE_ERROR_MESSAGES: Record<MaintenanceErrorKind, { es: string; en: string }> = {
  // «No cambió nada» se refiere a la operación cancelada por el tiempo, no a la
  // noche entera ni a otras ventas que ya se hubieran procesado.
  timeout: {
    es: "Tardó demasiado y se canceló; no cambió nada",
    en: "It took too long and was canceled; nothing changed",
  },
  permission: {
    es: "Sin permiso para hacer la operación",
    en: "No permission to perform the operation",
  },
  stripe: {
    es: "Falló la consulta o la cancelación en Stripe",
    en: "The Stripe lookup or cancellation failed",
  },
  sale_not_closed: {
    es: "No se pudo cerrar la venta en PlayERP",
    en: "The sale could not be closed in PlayERP",
  },
  owner_notice: {
    es: "No salió el aviso al dueño de la sede",
    en: "The notice to the venue owner was not sent",
  },
  database: {
    es: "No se pudo leer o actualizar la base de datos",
    en: "The database could not be read or updated",
  },
  unexpected: {
    es: "Error inesperado",
    en: "Unexpected error",
  },
};

/** Texto tecnico de un error tal como se guardo (cadena tal cual; objeto en JSON). */
export function maintenanceErrorText(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") return raw.trim() === "" ? null : raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

/**
 * Tipo de un error por su texto. Primero las causas concretas que pueden ir
 * dentro de un prefijo generico (timeout, permisos), despues los prefijos.
 */
export function maintenanceErrorKind(raw: unknown): MaintenanceErrorKind {
  const t = maintenanceErrorText(raw);
  if (!t) return "unexpected";
  const s = t.trim();
  if (/statement timeout|canceling statement due to|\b57014\b/i.test(s)) return "timeout";
  if (/permission denied|\b42501\b|unauthori[sz]ed/i.test(s)) return "permission";
  if (/^(stripe:|cancel_failed\b)/i.test(s)) return "stripe";
  if (/^(finalize_failed|decline_not_applied|abandon_not_applied)\b/i.test(s)) return "sale_not_closed";
  if (/^owner_notice_not_dispatched\b/i.test(s)) return "owner_notice";
  if (/^(list_failed|expire_failed)\b/i.test(s)) return "database";
  return "unexpected";
}

export interface MaintenanceErrorMessage {
  kind: MaintenanceErrorKind;
  /** Frase legible (la causa). */
  message: string;
  /** Codigo tecnico tal como se guardo, para el «Detalle técnico» plegado. */
  technical: string;
}

/** Frase legible + texto tecnico de un error; null si no hay error. */
export function maintenanceErrorMessage(
  raw: unknown,
  locale: MaintenanceLocale = "es",
): MaintenanceErrorMessage | null {
  const technical = maintenanceErrorText(raw);
  if (!technical) return null;
  const kind = maintenanceErrorKind(technical);
  return { kind, message: MAINTENANCE_ERROR_MESSAGES[kind][loc(locale)], technical };
}

/**
 * Valor de «Resuelto» / «Resolved»: la cifra si la hay; «No aplica» si la
 * tarea (o la noche, o el intento) fallo sin cifra; null en el resto (el
 * llamante deja su vacio de siempre).
 */
export function maintenanceResolvedText(
  resolved: number | null | undefined,
  failed: boolean,
  locale: MaintenanceLocale = "es",
): string | null {
  if (typeof resolved === "number" && Number.isFinite(resolved)) return String(resolved);
  return failed ? MAINTENANCE_LABELS[loc(locale)].notApplicable : null;
}
