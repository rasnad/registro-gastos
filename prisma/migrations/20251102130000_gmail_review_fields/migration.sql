-- Datos extraídos de correos para revisión (no se guarda el cuerpo completo)
ALTER TABLE "ProcessedGmailMessage"
  ADD COLUMN IF NOT EXISTS "merchant" TEXT,
  ADD COLUMN IF NOT EXISTS "amount" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "currency" "Currency",
  ADD COLUMN IF NOT EXISTS "purchaseDate" DATE,
  ADD COLUMN IF NOT EXISTS "installments" INTEGER,
  ADD COLUMN IF NOT EXISTS "cardLast4" TEXT,
  ADD COLUMN IF NOT EXISTS "cardType" TEXT;
