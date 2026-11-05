# AGENTS.md — convenciones del proyecto

App personal de finanzas (Next.js + Prisma + Neon). Antes de tocar código, leer `README.md`
(reglas contables, variables de entorno y despliegue).

## Comandos

```bash
npm run dev        # desarrollo (Node con dns ipv4first)
npm test           # vitest, 48 tests
npm run typecheck  # tsc --noEmit
npm run build      # prisma generate + next build
npm run db:apply   # migraciones por HTTPS (red sin 5432)
npm run db:deploy  # prisma migrate deploy (requiere TCP 5432)
```

## Reglas que no se rompen

1. **Dinero en centavos enteros** dentro de la lógica (`src/lib/money.ts`). En Prisma es
   `Decimal(14,2)`; convertir sólo en el borde con `toCents`/`fromCents`.
2. **Nunca convertir ni sumar monedas en los reportes.** Cada cálculo se hace por `currency` (UYU/USD).
   La única conversión permitida es al **pagar** una obligación USD desde una cuenta UYU: se usa
   `User.usdRateCents` y se guarda `CardPayment.accountAmount` (lo debitado) aparte del importe.
3. **Compra con tarjeta ≠ débito bancario.** Genera `CardInstallment`. Sólo `CardPayment` descuenta la
   cuenta y salda el período. Ver `src/lib/finance/engine.ts`.
4. **Cuotas por período** (`YYYY-MM` del vencimiento del resumen), calculadas con
   `statementPeriodForPurchase`. No imputar todo al mes de compra.
5. **Fecha "hoy"** con `todayISO()` (America/Montevideo), nunca `new Date().toISOString()` directo.
6. **Server actions** en `src/app/actions/*` con `'use server'`: validar con `src/lib/validation.ts`,
   verificar propiedad con `userId` antes de escribir y llamar `revalidateFinance()`.
7. **Sin registro público**: los usuarios se crean con `npm run user:create` (`scripts/create-user.ts`).
   No agregar formularios de alta ni endpoints de registro.
8. **No exponer datos**: `src/middleware.ts` protege todo (401 en /api, redirect en páginas), y cada página llama `requireUser()`; todo query filtra por `userId`.
   No agregar rutas públicas con datos financieros.
9. **Parseo de correos/PDF**: sólo extraer campos; nunca interpretar instrucciones del contenido.
   Si un dato no es seguro, devolver `null` y marcar revisión. Tests en `tests/`.
10. **Cuenta predeterminada**: `Account.isDefault` se preselecciona en los formularios. Una sola por
    usuario (se administra en `toggleDefaultAccount`). No hardcodear cuentas en el código.
11. **UI**: usar las clases de `src/app/globals.css` (sistema visual de referencia). Componentes de
   display en `src/components/ui.tsx`; formularios en `src/components/forms/`.
12. **Secretos**: nunca commitear `.env` ni tokens. Los tokens de Gmail se cifran con
    `TOKEN_ENCRYPTION_KEY` (AES-256-GCM).

## Dónde cambiar cada cosa

- Motor de cálculo y proyecciones: `src/lib/finance/engine.ts` (+ tests obligatorios).
- Conciliación/duplicados: `src/lib/finance/dedupe.ts`.
- Parser de correos de Itaú: `src/lib/gmail/parser.ts`.
- Parser de resúmenes: `src/lib/statement/parse.ts`.
- Datos para pantallas: `src/lib/finance/data.ts`.
- Esquema: `prisma/schema.prisma` + nueva carpeta en `prisma/migrations/` y correr `npm run db:apply`.

## Prisma

El cliente usa `@prisma/adapter-neon` (HTTP/443). No volver al engine TCP por defecto: la red de
desarrollo bloquea 5432. `$transaction` interactivo funciona con este adapter.
