/**
 * Salud de la conexión con Gmail y continuidad de la importación.
 *
 * Reglas de diseño:
 *  - Este módulo es puro (sin Prisma ni Google): se usa desde el layout, la
 *    pantalla de Ajustes y los tests.
 *  - Reconnectar NO debe dejar un hueco ciego: se conserva el `importFrom`
 *    original, así los correos que llegaron mientras la conexión estaba caída
 *    se importan en la siguiente sincronización (el dedupe evita duplicados).
 */

export type GmailConnectionStatus = 'ACTIVE' | 'ERROR' | 'REVOKED'

export type GmailConnectionHealth = {
  status: GmailConnectionStatus | null
  lastSyncError?: string | null
}

export type GmailConnectionAlert = {
  tone: 'danger' | 'warn'
  title: string
  message: string
}

/**
 * Motivos por los que Google rechaza el refresh token y obliga a reconectar.
 * `invalid_grant` es el caso típico: token vencido (7 días en apps en Testing),
 * contraseña cambiada o acceso revocado.
 */
const AUTH_ERROR_PATTERNS = ['invalid_grant', 'invalid_rapt', 'token has been expired or revoked']

export function isAuthError(error?: string | null): boolean {
  if (!error) return false
  const value = error.toLowerCase()
  return AUTH_ERROR_PATTERNS.some((pattern) => value.includes(pattern))
}

export function needsReconnect(connection: GmailConnectionHealth | null | undefined): boolean {
  if (!connection) return false
  if (connection.status === 'REVOKED') return false
  return connection.status === 'ERROR' || isAuthError(connection.lastSyncError)
}

/**
 * Aviso para mostrar en la app cuando la importación de correos se detuvo.
 * Devuelve null cuando no hay nada que avisar: sin conexión, desconectada a
 * propósito o funcionando bien.
 */
export function gmailConnectionAlert(
  connection: GmailConnectionHealth | null | undefined,
): GmailConnectionAlert | null {
  if (!needsReconnect(connection)) return null
  if (isAuthError(connection?.lastSyncError)) {
    return {
      tone: 'danger',
      title: 'Gmail dejó de importar consumos',
      message:
        'El permiso de Gmail venció o fue revocado. Los avisos de Itaú siguen llegando al correo, pero no se están registrando: reconectá la cuenta para reanudar la importación.',
    }
  }
  return {
    tone: 'danger',
    title: 'La conexión con Gmail tiene un error',
    message:
      'La última sincronización falló y los avisos de Itaú no se están registrando. Revisá la conexión en Ajustes.',
  }
}

/**
 * Momento desde el que se escuchan correos.
 * Primera conexión: ahora. Reconexión: se conserva el original para no perder
 * los avisos que llegaron con la conexión caída.
 */
export function importFromForConnection(
  existing: Date | null | undefined,
  now: Date = new Date(),
): Date {
  return existing ?? now
}
