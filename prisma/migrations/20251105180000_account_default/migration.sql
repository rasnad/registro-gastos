-- Cuenta predeterminada para preseleccionar en los formularios.
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
