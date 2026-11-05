-- Las tarjetas aceptan consumos en pesos y en dólares: la moneda no es una
-- propiedad de la tarjeta. El pago se registra por moneda de la obligación y
-- se debita en pesos a la cotización configurada.
ALTER TABLE "CreditCard" DROP COLUMN IF EXISTS "currency";
