-- Las cuotas creadas manualmente no son estimadas: el período se calcula con el cierre configurado.
-- Sólo se marcan como estimadas las que provienen de Gmail o de un resumen sin período explícito.
ALTER TABLE "CardInstallment" ALTER COLUMN "isEstimated" SET DEFAULT false;
