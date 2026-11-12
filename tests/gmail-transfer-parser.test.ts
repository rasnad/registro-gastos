import { describe, expect, it } from 'vitest'
import { isTransferSubject, parseTransferEmail } from '@/lib/gmail/transfer-parser'

describe('avisos de transferencias', () => {
  it('reconoce el asunto del aviso de Itaú', () => {
    expect(isTransferSubject('Aviso de transferencia realizada')).toBe(true)
    expect(isTransferSubject('Aviso transferencia realizada')).toBe(true)
    expect(isTransferSubject('Aviso de consumo aprobado')).toBe(false)
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
      originLast4: '1234',
      recipient: null,
      date: '2026-11-10',
      dateFromEmail: true,
    })
  })

  it('deja vacíos los campos que no puede identificar', () => {
    expect(parseTransferEmail('Transferencia realizada', null)).toEqual({
      amountCents: null, currency: null, destinationAccount: null,
      originLast4: null, recipient: null, date: null, dateFromEmail: false,
    })
  })
})
