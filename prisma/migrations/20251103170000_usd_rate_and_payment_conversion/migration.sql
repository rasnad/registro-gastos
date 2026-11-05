-- Cotización configurable (centavos de UYU por 1 USD) e importe debitado de la cuenta.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "usdRateCents" INTEGER NOT NULL DEFAULT 4100;

ALTER TABLE "CardPayment"
  ADD COLUMN IF NOT EXISTS "accountAmount" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "exchangeRate" INTEGER;
