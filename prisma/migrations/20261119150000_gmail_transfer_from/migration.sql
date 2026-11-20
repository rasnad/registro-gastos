-- Fecha de corte para importar sólo las transferencias nuevas.
-- Las conexiones existentes arrancan a partir de la aplicación de esta
-- migración: no se importan avisos de transferencia anteriores.
ALTER TABLE "GmailConnection"
  ADD COLUMN IF NOT EXISTS "transferFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
