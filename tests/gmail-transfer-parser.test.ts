import { describe, expect, it } from 'vitest'
import { isTransferSubject, parseTransferEmail } from '@/lib/gmail/transfer-parser'

describe('avisos de transferencias', () => {
  it('reconoce el asunto del aviso de Itaú, con o sin sufijo', () => {
    expect(isTransferSubject('Aviso de transferencia realizada')).toBe(true)
    expect(isTransferSubject('Aviso transferencia realizada')).toBe(true)
    expect(isTransferSubject('Aviso de transferencia realizada - Itaú')).toBe(true)
    expect(isTransferSubject('  AVISO DE TRANSFERENCIA REALIZADA ')).toBe(true)
    expect(isTransferSubject('Aviso de consumo aprobado con tarjeta de crédito')).toBe(false)
  })

  it.each([
    ['64.00 US.D', 6400, 'USD'],
    ['1850.00 URGP', 185000, 'UYU'],
  ] as const)('extrae los datos del aviso con importe %s', (amount, cents, currency) => {
    const parsed = parseTransferEmail(
      `Transferencia realizada desde la cuenta **** 1234 Importe: ${amount} Cuenta destino: 987654 Banco/Institución destino: Banco Itaú`,
      '2026-11-10',
    )
    expect(parsed).toEqual({
      amountCents: cents,
      currency,
      destinationAccount: '987654',
      destinationBank: 'Banco Itaú',
      originLast4: '1234',
      recipient: null,
      date: '2026-11-10',
      dateFromEmail: true,
    })
  })

  it('lee el texto real del aviso de transferencia en pesos', () => {
    const text = [
      'Transferencia realizada desde la cuenta ****6166',
      'Importe: 2000.00 UYU',
      'Cuenta destino: 0075001201099761',
      'Banco/Institución destino: Santander',
    ].join('\n')
    expect(parseTransferEmail(text, '2026-11-19')).toEqual({
      amountCents: 200000,
      currency: 'UYU',
      destinationAccount: '0075001201099761',
      destinationBank: 'Santander',
      originLast4: '6166',
      recipient: null,
      date: '2026-11-19',
      dateFromEmail: true,
    })
  })

  it('deja vacíos los campos que no puede identificar', () => {
    expect(parseTransferEmail('Transferencia realizada', null)).toEqual({
      amountCents: null,
      currency: null,
      destinationAccount: null,
      destinationBank: null,
      originLast4: null,
      recipient: null,
      date: null,
      dateFromEmail: false,
    })
  })
})
