import { describe, expect, it } from 'vitest'
import {
  gmailConnectionAlert,
  importFromForConnection,
  isAuthError,
  needsReconnect,
} from '@/lib/gmail/status'

describe('salud de la conexión de Gmail', () => {
  it('detecta el token vencido como error de autenticación', () => {
    expect(isAuthError('invalid_grant')).toBe(true)
    expect(isAuthError('Error: invalid_grant: Token has been expired or revoked.')).toBe(true)
    expect(isAuthError('La fecha se tomó del correo, no del consumo.')).toBe(false)
    expect(isAuthError(null)).toBe(false)
    expect(isAuthError('')).toBe(false)
  })

  it('pide reconectar cuando la conexión quedó en ERROR', () => {
    expect(needsReconnect({ status: 'ERROR', lastSyncError: 'invalid_grant' })).toBe(true)
  })

  it('pide reconectar si la conexión está activa pero el token ya no sirve', () => {
    expect(needsReconnect({ status: 'ACTIVE', lastSyncError: 'invalid_grant' })).toBe(true)
  })

  it('no molesta cuando está activa y sana, o desconectada a propósito', () => {
    expect(needsReconnect({ status: 'ACTIVE', lastSyncError: null })).toBe(false)
    expect(needsReconnect({ status: 'REVOKED', lastSyncError: null })).toBe(false)
    expect(needsReconnect(null)).toBe(false)
  })

  it('avisa en la app cuando el permiso venció, explicando que los correos llegan igual', () => {
    const alert = gmailConnectionAlert({ status: 'ERROR', lastSyncError: 'invalid_grant' })
    expect(alert).not.toBeNull()
    expect(alert!.tone).toBe('danger')
    expect(alert!.title).toContain('Gmail dejó de importar')
    expect(alert!.message).toContain('reconectá')
  })

  it('avisa con un mensaje genérico ante cualquier otro error', () => {
    const alert = gmailConnectionAlert({ status: 'ACTIVE', lastSyncError: 'Quota exceeded' })
    expect(alert).toBeNull()
    expect(needsReconnect({ status: 'ERROR', lastSyncError: 'Quota exceeded' })).toBe(true)
    expect(gmailConnectionAlert({ status: 'ERROR', lastSyncError: 'Quota exceeded' })!.title).toContain('error')
  })

  it('no muestra aviso si nunca se conectó Gmail o se desconectó a propósito', () => {
    expect(gmailConnectionAlert(null)).toBeNull()
    expect(gmailConnectionAlert({ status: 'REVOKED', lastSyncError: 'invalid_grant' })).toBeNull()
  })
})

describe('inicio de la escucha de correos', () => {
  it('en la primera conexión empieza en el momento actual', () => {
    const now = new Date('2026-11-17T12:00:00.000Z')
    expect(importFromForConnection(null, now)).toEqual(now)
    expect(importFromForConnection(undefined, now)).toEqual(now)
  })

  it('al reconectar conserva el inicio original para no dejar un hueco ciego', () => {
    const original = new Date('2026-11-07T01:40:16.593Z')
    const now = new Date('2026-11-17T12:00:00.000Z')
    // Los avisos que llegaron entre el 7 y la reconexión se siguen escuchando.
    expect(importFromForConnection(original, now)).toEqual(original)
  })
})
