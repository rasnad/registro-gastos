/** Cuenta cada movimiento una sola vez y conserva los correos sin movimiento asociado. */
export function countPendingReviews(
  expenses: Array<{ id: string; status: string }>,
  messages: Array<{ expenseId: string | null }>,
): number {
  const expenseIds = new Set(expenses.map(expense => expense.id))
  return expenses.filter(expense => expense.status === 'NEEDS_REVIEW').length +
    messages.filter(message => !message.expenseId || !expenseIds.has(message.expenseId)).length
}
