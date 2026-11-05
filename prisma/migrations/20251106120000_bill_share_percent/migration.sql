-- Porcentaje del gasto que corresponde al usuario (gastos compartidos).
-- El importe cargado sigue siendo el total; el saldo aplica este porcentaje.
ALTER TABLE "RecurringBill"
  ADD COLUMN IF NOT EXISTS "sharePercent" INTEGER NOT NULL DEFAULT 100;
