-- Un resumen de tarjeta puede tener obligaciones en pesos y en dólares.
-- El pago se registra por período Y moneda.
DROP INDEX IF EXISTS "CardPayment_creditCardId_period_key";
CREATE UNIQUE INDEX "CardPayment_creditCardId_period_currency_key"
  ON "CardPayment"("creditCardId", "period", "currency");
