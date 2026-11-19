-- Reparto de gastos entre usuarios registrados (gastos compartidos).
-- Sin filas, el gasto lo asume al 100% su dueño. El importe del gasto sigue
-- siendo el total: acá sólo se registra quién asume qué parte.
CREATE TABLE "ExpenseShare" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sharePercent" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExpenseShare_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseShare_sharePercent_check" CHECK ("sharePercent" >= 0 AND "sharePercent" <= 100)
);
CREATE UNIQUE INDEX "ExpenseShare_expenseId_userId_key" ON "ExpenseShare"("expenseId", "userId");
CREATE INDEX "ExpenseShare_userId_idx" ON "ExpenseShare"("userId");
ALTER TABLE "ExpenseShare" ADD CONSTRAINT "ExpenseShare_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseShare" ADD CONSTRAINT "ExpenseShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
