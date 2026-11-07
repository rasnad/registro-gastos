import type { IndependentPayment } from '@/lib/finance/obligations'
import type { ObligationPayment } from '@prisma/client'
import { Dialog } from '@/components/dialog'
import { Money } from '@/components/ui'
import { CardPaymentForm, MiniForm } from '@/components/forms/other-forms'
import { deleteCardPayment } from '@/app/actions/cards'
import { deleteObligationPayment } from '@/app/actions/obligation-payments'
import type { AccountOption } from '@/components/forms/money-forms'
import { fromCents, toCents } from '@/lib/money'

export function PaymentHistory({ payments, accounts, name, usdRateCents, legacyPayments = [], legacyCardNotes = {} }: {
  legacyPayments?: IndependentPayment[]; legacyCardNotes?: Record<string, string | null>;
  payments: ObligationPayment[]; accounts: AccountOption[]; name: string; usdRateCents: number
}) {
  return <details><summary>Historial de pagos ({payments.length + legacyPayments.length})</summary>
    <div className="stack-sm">
      {payments.length + legacyPayments.length === 0 ? <p className="hint">Todavía no hay pagos registrados.</p> : null}
      {legacyPayments.map(payment => <div className="import-row" key={payment.id}>
        <div className="between"><strong><Money cents={payment.amountCents} currency={payment.currency!} /></strong><span>{payment.paidAt} · {payment.period}</span></div>
        <p className="hint">Pago histórico · {accounts.find(a => a.id === payment.accountId)?.name ?? 'Fuera de las cuentas registradas'}{payment.accountAmountCents != null && payment.accountId ? <> · Débito: <Money cents={payment.accountAmountCents} currency={accounts.find(a => a.id === payment.accountId)?.currency ?? payment.currency!} /></> : null}</p>
        {payment.obligationKind === 'CARD' && payment.period && payment.currency ? <div className="row">
          <Dialog label="Editar pago" title={`Editar pago de ${name}`} buttonClassName="ghost-button small-button">
            <CardPaymentForm cards={[{id:payment.obligationId,name,closingDay:1,dueDay:1}]} accounts={accounts}
              defaultCardId={payment.obligationId} defaultPeriod={payment.period} defaultCurrency={payment.currency}
              defaultAmount={fromCents(payment.amountCents)} usdRateCents={usdRateCents} legacy
              payment={{id:payment.id.replace(/^legacy-card:/,''),paidAt:payment.paidAt,accountId:payment.accountId,debitAccount:true,note:legacyCardNotes[payment.id.replace(/^legacy-card:/,'')] ?? null}} />
          </Dialog>
          <MiniForm action={deleteCardPayment} hidden={{id:payment.id.replace(/^legacy-card:/,'')}} label="Eliminar pago" confirmMessage="¿Eliminar este pago? Se recalculará el saldo pendiente de la obligación." />
        </div> : null}
      </div>)}
      {payments.map(payment => <div className="import-row" key={payment.id}>
        <div className="between"><strong><Money cents={toCents(payment.amount)} currency={payment.currency} /></strong>
          <span>{payment.paidAt.toISOString().slice(0, 10)} · {payment.period}</span></div>
        <p className="hint">{accounts.find(a => a.id === payment.accountId)?.name ?? 'Fuera de las cuentas registradas'}
          {payment.accountId && !payment.debitAccount ? ' · sin descontar del saldo' : ''}
          {payment.accountAmount != null && payment.accountId ? <> · Débito: <Money cents={toCents(payment.accountAmount)} currency={accounts.find(a => a.id === payment.accountId)?.currency ?? payment.currency} /></> : null}
          {payment.note ? ` · ${payment.note}` : ''}</p>
        <div className="row">
          <Dialog label="Editar pago" title={`Editar pago de ${name}`} buttonClassName="ghost-button small-button">
            <CardPaymentForm cards={[{id: payment.obligationId, name, closingDay: 1, dueDay: 1}]}
              accounts={accounts} defaultCardId={payment.obligationId} defaultPeriod={payment.period}
              defaultCurrency={payment.currency} defaultAmount={fromCents(toCents(payment.amount))}
              obligationKind={payment.obligationKind === 'CARD' ? 'CARD' : 'BILL'} usdRateCents={usdRateCents}
              payment={{id: payment.id, paidAt: payment.paidAt.toISOString().slice(0, 10), accountId: payment.accountId, debitAccount: payment.debitAccount, note: payment.note}} />
          </Dialog>
          <MiniForm action={deleteObligationPayment} hidden={{id:payment.id}} label="Eliminar pago"
            confirmMessage="¿Eliminar este pago? Se recalculará el saldo pendiente de la obligación." />
        </div>
      </div>)}
    </div>
  </details>
}
