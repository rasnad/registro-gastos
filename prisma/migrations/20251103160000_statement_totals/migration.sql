-- Totales del resumen por moneda (Itaú muestra "SALDO CONTADO" en pesos y dólares).
ALTER TABLE "StatementImport"
  ADD COLUMN IF NOT EXISTS "totalUyu" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "totalUsd" DECIMAL(14,2);
