import {describe,it,expect} from 'vitest'
import {accountBalanceAt,accountBalanceBreakdown,billObligationBalance,cardObligationBalance,dashboardCommitments,computeCurrencySummary,projectMonths,monthObligationBalances,statementTotalsFromImports,type EngineInput,type BillSnapshot} from '@/lib/finance/engine'

// Regresión de los importes auditados, sin identificadores ni datos de conexión reales.
function november(): EngineInput {
  const rows = [
    ['rent',43000,50,true],['phone',1650,50,true],['electricity',4800,50,true],['mobile',750,100,true],['tax',1630,50,true],
    ['classes',2450,100,false],['vat',39500,100,false],['bps',4594,100,false],['health',5144,100,false],['accountant',3000,100,false],
  ] as const
  const bills: BillSnapshot[]=rows.map(([id,amount,sharePercent])=>({id,name:id,categoryId:null,currency:'UYU',amountType:'FIXED',amountFixedCents:amount*100,amountMinCents:null,amountMaxCents:null,sharePercent,frequency:['tax','vat','accountant'].includes(id)?'BIMONTHLY':'MONTHLY',dueDay:10,paymentSource:'ACCOUNT',accountId:'bank',creditCardId:null,startDate:'2026-11-01',endDate:null,isActive:true}))
  return {today:'2026-11-07',accounts:[{id:'bank',name:'Bank',currency:'UYU',kind:'BANK',openingCents:11500000,openingDate:'2026-11-04',isActive:true}],
    cards:[{id:'card',name:'Card',closingDay:5,dueDay:18,isActive:true}],bills,
    billOccurrences:rows.filter(r=>r[3]).map(([id,amount])=>({id:`old-${id}`,billId:id,period:'2026-11',dueDate:'2026-11-10',amountActualCents:amount*100,amountMinCents:null,amountMaxCents:null,status:'PAID',paidAt:'2026-11-05',accountId:'bank',currency:'UYU'})),
    statementTotals:[{cardId:'card',period:'2026-11',currency:'UYU',totalCents:2984762},{cardId:'card',period:'2026-11',currency:'USD',totalCents:76757}],
    cardPayments:[{id:'old-uyu',creditCardId:'card',period:'2026-11',currency:'UYU',amountCents:2000000,accountAmountCents:2000000,paidAt:'2026-11-07',accountId:'bank'},{id:'old-usd',creditCardId:'card',period:'2026-11',currency:'USD',amountCents:76757,accountAmountCents:3147037,paidAt:'2026-11-07',accountId:'bank'}],
    incomes:[{id:'salary',description:'Salary',amountCents:11500000,currency:'UYU',kind:'FIXED',recurrence:'MONTHLY',dayOfMonth:4,startDate:'2026-12-05',endDate:null,accountId:'bank',isActive:true}],adjustments:[],expenses:[],installments:[],independentPayments:[],contributions:[],goals:[]}
}

describe('auditoría de noviembre: original, pagado y pendiente',()=>{
  it('explica 80978 = 26290 pagados + 54688 pendientes y el saldo real',()=>{
    const input=november();const d=dashboardCommitments(input,'2026-11',4100)
    expect(d.bills).toMatchObject({totalCents:8097800,remainingCents:5468800,status:'PARTIAL'})
    expect(accountBalanceBreakdown(input.accounts[0],input)).toEqual({openingCents:11500000,incomeCents:0,adjustmentCents:0,expenseCents:0,cardPaymentCents:5147037,billPaymentCents:2629000,contributionCents:0,balanceCents:3723963})
    expect(d.cards).toMatchObject({totalCents:6131799,remainingCents:984762,status:'PARTIAL'})
    expect(d.availableAfterCommitmentsCents).toBe(-2729599)
    expect(computeCurrencySummary(input,'UYU').afterCommitmentsCents).toBe(d.availableAfterCommitmentsCents)
    expect(projectMonths(input,'UYU',1)[0].endCents).toBe(d.availableAfterCommitmentsCents)
  })
  it('conserva el total original al pagar, corregir y eliminar; no altera cuotas',()=>{
    const input=november();input.cardPayments=[];input.billOccurrences=[]
    const original=cardObligationBalance(input,'card','2026-11','UYU');expect(original.totalCents).toBe(2984762)
    const payment={id:'new',obligationKind:'CARD' as const,obligationId:'card',period:'2026-11',currency:'UYU' as const,amountCents:10000,accountAmountCents:10000,accountId:'bank',paidAt:'2026-11-07',debitAccount:true}
    input.independentPayments=[payment]
    expect(cardObligationBalance(input,'card','2026-11','UYU')).toMatchObject({totalCents:2984762,paidCents:10000,remainingCents:2974762,status:'PARTIAL'})
    input.independentPayments=[{...payment,amountCents:2984762,accountAmountCents:2984762}]
    expect(cardObligationBalance(input,'card','2026-11','UYU')).toMatchObject({totalCents:2984762,paidCents:2984762,remainingCents:0,status:'PAID'})
    input.independentPayments=[]
    expect(cardObligationBalance(input,'card','2026-11','UYU')).toEqual(original)
    expect(accountBalanceAt(input.accounts[0],input)).toBe(11500000)
  })
  it('eliminar los dos pagos nuevos revierte 61317.99 y conserva los históricos',()=>{
    const input=november()
    input.independentPayments=input.cardPayments.map((p,i)=>({id:`new-${i}`,obligationKind:'CARD',obligationId:'card',period:p.period,currency:p.currency,amountCents:p.currency==='UYU'?2984762:76757,accountAmountCents:p.currency==='UYU'?2984762:3147037,accountId:'bank',paidAt:p.paidAt,debitAccount:true}))
    expect(accountBalanceAt(input.accounts[0],input)).toBe(-2407836)
    expect(dashboardCommitments(input,'2026-11',4100).warnings.join(' ')).toContain('históricos y nuevos')
    input.independentPayments=[]
    expect(accountBalanceAt(input.accounts[0],input)).toBe(3723963)
    expect(cardObligationBalance(input,'card','2026-11','USD')).toMatchObject({totalCents:76757,paidCents:76757,status:'PAID'})
  })
  it('reconoce pagos parciales de cuentas compartidas sin descontarlos dos veces',()=>{
    const input=november();input.billOccurrences=[];input.cardPayments=[]
    const bill=input.bills[0]
    const before=dashboardCommitments(input,'2026-11',4100)
    const payment={id:'bill-payment',obligationKind:'BILL' as const,obligationId:bill.id,period:'2026-11',currency:'UYU' as const,amountCents:10000,accountAmountCents:5000,accountId:'bank',paidAt:'2026-11-07',debitAccount:true}
    input.independentPayments=[payment,payment]
    expect(accountBalanceAt(input.accounts[0],input)).toBe(11495000)
    expect(billObligationBalance(input,bill,'2026-11')).toMatchObject({totalCents:4300000,paidCents:10000,remainingCents:4290000})
    const after=dashboardCommitments(input,'2026-11',4100)
    expect(after.availableAfterCommitmentsCents).toBe(before.availableAfterCommitmentsCents)
    expect(projectMonths(input,'UYU',1)[0].billsCents).toBe(before.bills.remainingCents-5000)
  })
  it('no mezcla meses ni monedas y no suma las cuotas encima del total importado',()=>{
    const input=november()
    input.installments.push({id:'inst',expenseId:'e',cardId:'card',number:1,count:2,amountCents:9999999,currency:'UYU',period:'2026-11',dueDate:null,isPaid:true,isEstimated:false,expenseStatus:'CONFIRMED'})
    expect(cardObligationBalance(input,'card','2026-11','UYU').totalCents).toBe(2984762)
    expect(cardObligationBalance(input,'card','2026-12','UYU').paidCents).toBe(0)
    expect(monthObligationBalances(input,'2026-12').filter(b=>['vat','tax','accountant'].includes(b.id))).toEqual([])
    expect(cardObligationBalance(input,'card','2026-11','USD').paidCents).toBe(76757)
  })
  it('sin otros movimientos reproduce el ejemplo hipotético de -1005.99',()=>{
    const input=november();input.cardPayments=[];input.billOccurrences=[]
    input.bills=[{...input.bills[0],id:'hypothetical',amountFixedCents:5468800,sharePercent:100}]
    expect(dashboardCommitments(input,'2026-11',4100).availableAfterCommitmentsCents).toBe(-100599)
  })
  it('elige una sola importación por tarjeta/período/moneda',()=>{
    const row={creditCardId:'card',period:'2026-11',totalUyu:'29847.62',totalUsd:'767.57',totalAmount:null}
    expect(statementTotalsFromImports([row,row])).toHaveLength(2)
  })
})
