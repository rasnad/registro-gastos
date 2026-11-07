-- Aditiva: conserva pagos y cuotas históricos para su revisión y migración posterior.
CREATE TABLE "ObligationPayment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "obligationKind" TEXT NOT NULL,
  "obligationId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "currency" "Currency" NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "paidAt" DATE NOT NULL,
  "accountId" TEXT,
  "accountAmount" DECIMAL(14,2),
  "debitAccount" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ObligationPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ObligationPayment_kind_check" CHECK ("obligationKind" IN ('CARD', 'BILL')),
  CONSTRAINT "ObligationPayment_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "ObligationPayment_account_amount_check" CHECK ("accountAmount" IS NULL OR "accountAmount" >= 0)
);
CREATE INDEX "ObligationPayment_userId_obligationKind_obligationId_period_currency_idx" ON "ObligationPayment"("userId", "obligationKind", "obligationId", "period", "currency");
CREATE INDEX "ObligationPayment_userId_accountId_paidAt_idx" ON "ObligationPayment"("userId", "accountId", "paidAt");
