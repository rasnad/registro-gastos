-- Ahorro inicial declarado y transferencias del ahorro a una cuenta.
-- El ahorro inicial es por moneda (no se convierten monedas) y los retiros
-- devuelven la plata a la cuenta elegida (aumentan su saldo).
CREATE TABLE "SavingsFund" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currency" "Currency" NOT NULL,
  "initialAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "startDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavingsFund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SavingsFund_amount_check" CHECK ("initialAmount" >= 0)
);
CREATE UNIQUE INDEX "SavingsFund_userId_currency_key" ON "SavingsFund"("userId", "currency");
ALTER TABLE "SavingsFund" ADD CONSTRAINT "SavingsFund_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SavingsWithdrawal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currency" "Currency" NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "date" DATE NOT NULL,
  "accountId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavingsWithdrawal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SavingsWithdrawal_amount_check" CHECK ("amount" > 0)
);
CREATE INDEX "SavingsWithdrawal_userId_date_idx" ON "SavingsWithdrawal"("userId", "date");
CREATE INDEX "SavingsWithdrawal_userId_accountId_idx" ON "SavingsWithdrawal"("userId", "accountId");
ALTER TABLE "SavingsWithdrawal" ADD CONSTRAINT "SavingsWithdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavingsWithdrawal" ADD CONSTRAINT "SavingsWithdrawal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
