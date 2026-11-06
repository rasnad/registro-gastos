-- La sincronización arranca en el momento de conectar Gmail (no importa el pasado).
ALTER TABLE "GmailConnection"
  ALTER COLUMN "importFrom" TYPE timestamptz USING "importFrom"::timestamptz;
