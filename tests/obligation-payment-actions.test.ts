import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  legacy: {findFirst: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn()},
  payment: {findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn()},
  card: {findFirst: vi.fn()}, bill: {findFirst: vi.fn()}, account: {findFirst: vi.fn()}, revalidate: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({requireUser: async () => ({id:'user',usdRateCents:4100})}))
vi.mock('@/lib/db', () => ({prisma: {obligationPayment:mocks.payment,cardPayment:mocks.legacy,creditCard:mocks.card,recurringBill:mocks.bill,account:mocks.account}}))
vi.mock('@/lib/revalidate', () => ({revalidateFinance:mocks.revalidate}))
import { editLegacyCardPayment, deleteCardPayment } from '@/app/actions/cards'
import { saveObligationPayment, deleteObligationPayment } from '@/app/actions/obligation-payments'
function form(values: Record<string,string | undefined> = {}) {
  const data = new FormData()
  Object.entries({obligationKind:'CARD',obligationId:'card',period:'2026-11',currency:'UYU',amount:'25.00',paidAt:'2026-11-07',...values}).forEach(([key,value])=>{ if (value !== undefined) data.set(key,value) })
  return data
}
beforeEach(()=>{vi.resetAllMocks();mocks.card.findFirst.mockResolvedValue({id:'card'});mocks.bill.findFirst.mockResolvedValue({id:'bill',currency:'UYU',paymentSource:'ACCOUNT'});mocks.payment.deleteMany.mockResolvedValue({count:1})})
describe('acciones conectadas a los formularios de pagos',()=>{
  it.each(['CARD','BILL'])('registra pagos independientes parciales y completos de %s',async kind=>{
    for(const amount of ['25.00','75.00']) expect(await saveObligationPayment({},form({obligationKind:kind,amount}))).toEqual({ok:true})
    expect(mocks.payment.create).toHaveBeenCalledTimes(2)
    expect(mocks.payment.create).toHaveBeenCalledWith({data:expect.objectContaining({userId:'user',amount:'25.00',obligationKind:kind})})
    expect(mocks.revalidate).toHaveBeenCalledTimes(2)
  })
  it('corrige un pago propio y vuelve a validar las pantallas',async()=>{
    mocks.payment.findFirst.mockResolvedValue({id:'p',obligationKind:'CARD',obligationId:'card',period:'2026-11',currency:'UYU',amount:'10',accountId:null})
    expect(await saveObligationPayment({},form({id:'p'}))).toEqual({ok:true})
    expect(mocks.payment.updateMany).toHaveBeenCalledWith({where:{id:'p',userId:'user'},data:expect.objectContaining({amount:'25.00'})})
  })
  it('elimina sólo pagos propios y actualiza las pantallas',async()=>{
    expect(await deleteObligationPayment({},form({id:'p'}))).toEqual({ok:true})
    expect(mocks.payment.deleteMany).toHaveBeenCalledWith({where:{id:'p',userId:'user'}})
    expect(mocks.revalidate).toHaveBeenCalledOnce()
  })
  it.each([{amount:'0'},{amount:'-1'},{paidAt:'2026-02-30'},{period:'2026-13'}])('rechaza datos inválidos %j',async values=>{
    expect(await saveObligationPayment({},form(values))).toHaveProperty('error')
    expect(mocks.payment.create).not.toHaveBeenCalled()
  })
  it('no edita un pago ajeno',async()=>{
    mocks.payment.findFirst.mockResolvedValue(null)
    expect(await saveObligationPayment({},form({id:'other'}))).toHaveProperty('error')
    expect(mocks.payment.updateMany).not.toHaveBeenCalled()
  })
  it('valida la moneda de la cuenta de origen',async()=>{
    mocks.account.findFirst.mockResolvedValue({currency:'USD'})
    expect(await saveObligationPayment({},form({accountId:'bank'}))).toHaveProperty('error')
    expect(mocks.payment.create).not.toHaveBeenCalled()
  })
  it('debita solo la parte personal de una cuenta compartida',async()=>{
    mocks.bill.findFirst.mockResolvedValue({id:'bill',currency:'UYU',paymentSource:'ACCOUNT',sharePercent:50})
    mocks.account.findFirst.mockResolvedValue({currency:'UYU'})
    expect(await saveObligationPayment({},form({obligationKind:'BILL',obligationId:'bill',accountId:'bank',amount:'100.00'}))).toEqual({ok:true})
    expect(mocks.payment.create).toHaveBeenCalledWith({data:expect.objectContaining({amount:'100.00',accountAmount:'50.00'})})
  })

})

describe('edición y eliminación de pagos históricos de tarjeta',()=>{
  it('actualiza un pago propio sin alterar cuotas',async()=>{
    mocks.legacy.findFirst.mockResolvedValue({id:'old',currency:'USD',amount:'10',accountId:'bank',accountAmount:'410',exchangeRate:4100})
    mocks.account.findFirst.mockResolvedValue({currency:'UYU'})
    mocks.legacy.updateMany.mockResolvedValue({count:1})
    expect(await editLegacyCardPayment({},form({id:'old',amount:'20',accountId:'bank'}))).toEqual({ok:true})
    expect(mocks.legacy.updateMany).toHaveBeenCalledWith({where:{id:'old',userId:'user'},data:expect.objectContaining({amount:'20.00',accountAmount:'820.00',exchangeRate:4100})})
    expect(mocks.revalidate).toHaveBeenCalledOnce()
  })
  it('rechaza editar un pago ajeno y elimina sólo el pago propio',async()=>{
    mocks.legacy.findFirst.mockResolvedValue(null)
    expect(await editLegacyCardPayment({},form({id:'other'}))).toHaveProperty('error')
    expect(mocks.legacy.updateMany).not.toHaveBeenCalled()
    mocks.legacy.deleteMany.mockResolvedValue({count:1})
    expect(await deleteCardPayment({},form({id:'old'}))).toEqual({ok:true})
    expect(mocks.legacy.deleteMany).toHaveBeenCalledWith({where:{id:'old',userId:'user'}})
  })
})
