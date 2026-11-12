# Registro de gastos

La aplicación web también se puede instalar gratis en iPhone como PWA desde Safari
(Compartir → Agregar a pantalla de inicio). Usa la misma app y los mismos datos del servidor;
los despliegues web se reflejan al volver a abrirla o recargarla. La adaptación nativa experimental
vive en `mobile/`; su arquitectura está en la [guía móvil](docs/mobile.md).

Aplicación web personal para entender la situación financiera actual y los próximos meses: gastos
diarios, tarjetas de crédito y cuotas, cuentas fijas y variables, objetivos de ahorro y proyección
mensual. Pesos uruguayos y dólares **por separado**, sin conversiones automáticas.

- **Stack:** Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + Prisma 6 + PostgreSQL (Neon).
- **Diseño:** sistema visual de la referencia UX/UI provista (DM Sans, paleta lavanda/menta/coral,
  sidebar, tarjetas, bottom-nav en móvil). Responsive y accesible.
- **Autenticación:** sesión propia firmada (JWT HS256 en cookie httpOnly) con contraseña bcrypt.
- **Privacidad:** todas las rutas exigen sesión; cada consulta filtra por `userId`. Es de uso
  personal: no hay registro público, los usuarios se crean desde la terminal.

---

## 1. Poner en marcha

```bash
npm install
cp .env.example .env       # completar variables (ver §2)
npm run db:apply           # aplica las migraciones por HTTPS (Neon)
npm run dev                # http://localhost:3000
```

La primera vez no hay usuarios, así que `/login` muestra el comando para crear el primero:

```bash
npm run user:create -- --email=tu@correo.uy --name="Tu nombre"
```

Imprime una contraseña aleatoria (o pasá `--password=...`). Después ya se entra normalmente con
email y contraseña. Para el día a día:

```bash
npm run user:create -- --list                    # ver usuarios
npm run user:create -- --reset --email=...       # nueva contraseña
```

### ¿Una cuenta o dos?

- **Finanzas compartidas (lo habitual en pareja):** un solo usuario, los dos entran con el mismo
  email y contraseña. Ven y editan el mismo registro.
- **Registros separados:** un usuario para cada uno. Cada uno ve sólo sus movimientos (los datos no
  se comparten).

El modelo de datos ya separa todo por `userId`, así que cambiar de una opción a otra no rompe nada.

Datos de demostración opcionales:

```bash
ALLOW_DEMO_SEED=1 npm run seed:demo
# usuario: demo@registro.local · contraseña: demo-gastos-2025
```

> **Nota sobre redes corporativas:** el script `dev`/`build`/`start` arranca Node con
> `--dns-result-order=ipv4first` porque en algunas redes el endpoint de Neon resuelve primero IPv6 y
> la conexión falla. En Vercel o en una red normal no molesta.

---

## 2. Variables de entorno

| Variable | Obligatoria | Qué es |
| --- | --- | --- |
| `DATABASE_URL` | Sí | Cadena de conexión de Neon (termina en `?sslmode=require`). |
| `AUTH_SECRET` | Sí | Secreto para firmar la cookie de sesión. `openssl rand -base64 48`. |
| `TOKEN_ENCRYPTION_KEY` | Sí para Gmail | Clave de 32 bytes en base64 para cifrar tokens de Google. `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID` | Gmail | OAuth Client ID de Google Cloud. |
| `GOOGLE_CLIENT_SECRET` | Gmail | OAuth Client Secret. |
| `GOOGLE_REDIRECT_URI` | Gmail | Debe coincidir exactamente con la registrada en Google. |
| `GMAIL_ALLOWED_SENDER_DOMAINS` | Recomendada | Dominios aceptados, separados por coma (`itau.com.uy,itau.com`). |
| `CRON_SECRET` | Cron | Secreto que Vercel Cron envía como `Authorization: Bearer`. |
| `GMAIL_PUBSUB_TOPIC` | Push de Gmail | Nombre completo del tema Pub/Sub del mismo proyecto que el cliente OAuth. |
| `GMAIL_PUBSUB_AUDIENCE` | Push de Gmail | Audiencia OIDC exacta configurada en la suscripción push. |
| `GMAIL_PUBSUB_SERVICE_ACCOUNT` | Push de Gmail | Correo de la cuenta de servicio usada por la suscripción autenticada. |

Las notificaciones push requieren una suscripción Pub/Sub autenticada dirigida a
`https://DOMINIO/api/gmail/push`. El endpoint valida la firma, audiencia y cuenta de servicio
del token de Google. Gmail publica en el tema mediante `gmail-api-push@system.gserviceaccount.com`
con el rol de publicador limitado al tema. La sincronización diaria renueva el `watch` y sirve
de respaldo; «Sincronizar ahora» también intenta activarlo. Se conservan los filtros existentes
de remitente y asunto, y solo se procesan conexiones activas con sincronización automática.

**Nunca** se commitea `.env` (está en `.gitignore`). `.env.example` no contiene valores reales.

---

## 3. Base de datos en Neon

1. En la consola de Neon, abrir el proyecto y copiar la cadena **Prisma/Node** del endpoint.
2. Pegarla en `.env`:
   ```env
   DATABASE_URL="postgresql://USUARIO:PASSWORD@HOST/DB?sslmode=require"
   ```
   El *Project ID* (`dry-sunset-25941262`) **no** es la cadena de conexión: es sólo un identificador.
3. Aplicar migraciones:
   ```bash
   npm run db:apply      # vía HTTPS (443) con el driver serverless de Neon
   # o, si tu red permite el puerto 5432:
   npm run db:deploy     # prisma migrate deploy
   ```
4. Verificar: `npm run db:studio` o abrir `/` después de crear la cuenta.

### Por qué hay dos comandos

`prisma migrate deploy` necesita TCP al puerto 5432. En la red donde se desarrolló esto ese puerto
está bloqueado, pero el 443 funciona. Por eso:

- La app usa Prisma + `@prisma/adapter-neon`, que habla **HTTP/443** (también en Vercel, sin agotar
  conexiones).
- `scripts/apply-migrations.ts` aplica los `.sql` de `prisma/migrations` y registra la fila en
  `_prisma_migrations` con el mismo formato que Prisma. Si después se corre `migrate deploy`, no
  repite nada.

### Migraciones incluidas

| Migración | Contenido |
| --- | --- |
| `20251102120000_init` | Todas las tablas, enums e índices. |
| `20251102130000_gmail_review_fields` | Campos extraídos de correos (sin cuerpo). |
| `20251102140000_installment_estimated_default` | `isEstimated` por defecto en `false` para cuotas manuales. |

---

## 4. Conectar Gmail (OAuth oficial)

### 4.1 Crear credenciales

1. [Google Cloud Console](https://console.cloud.google.com/) → crear proyecto.
2. **APIs y servicios → Biblioteca** → habilitar **Gmail API**.
3. **Pantalla de consentimiento OAuth**:
   - Tipo de usuario: **Externo**.
   - Nombre de la app, email de soporte y de contacto.
   - Agregar el permiso `https://www.googleapis.com/auth/gmail.readonly`.
   - **Usuarios de prueba**: agregá tu cuenta de Gmail (mientras la app esté en modo *Testing*).
4. **Credenciales → Crear credenciales → ID de cliente OAuth → Aplicación web**.
   - URIs de redirección autorizados:
     - `http://localhost:3000/api/gmail/callback`
     - `https://TU-DOMINIO.vercel.app/api/gmail/callback`
   - No se necesita JavaScript origin (el flujo es server-side).
5. Copiar Client ID y Client Secret a `.env`:
   ```env
   GOOGLE_CLIENT_ID="..."
   GOOGLE_CLIENT_SECRET="..."
   GOOGLE_REDIRECT_URI="http://localhost:3000/api/gmail/callback"
   ```

### 4.2 Permisos que se solicitan y por qué

| Scope | Para qué |
| --- | --- |
| `gmail.readonly` | Leer los correos de avisos de consumo y extraer comercio/importe/fecha/cuotas. **No** permite enviar, borrar ni modificar. |
| `openid` + `email` | Saber qué cuenta se conectó y mostrarla en Ajustes. |

No se piden contactos, calendario, Drive ni acceso al perfil completo.

### 4.3 Conectar y sincronizar

- Ir a **Ajustes → Conexión con Gmail → Conectar mi cuenta**.
- Al conectar se fija el **momento de inicio**: sólo se escuchan correos desde ese instante. No se
  importa nada anterior (no hay campo "importar desde").
- **Sincronizar ahora** procesa hasta 120 mensajes nuevos por corrida.
- Los asuntos buscados son:
  - `Aviso de consumo aprobado con tarjeta de crédito`
  - `Aviso de consumo aprobado con tarjeta de débito`

### 4.4 Qué se guarda y qué no

- Se guarda: `messageId`, remitente, asunto, fecha, y los campos extraídos (comercio, importe,
  moneda, fecha de compra, cuotas, últimos 4 dígitos). El **refresh token** se guarda cifrado con
  AES-256-GCM.
- **No** se guarda el cuerpo del correo ni el HTML.
- Al desconectar se borran los tokens; los gastos importados y los IDs de mensajes se conservan para
  no duplicar si volvés a conectar.

### 4.5 Límites reales de Google (importante)

- `gmail.readonly` es un **scope restringido**. Con la app en modo *Testing*, el refresh token vence a
  los **7 días** y hay que reconectar. Para uso continuo hay que publicar la app (sigue mostrando la
  advertencia de "app no verificada") y, para uso público, pasar la verificación de Google.
- Los límites de cuota de Gmail (lecturas por minuto/usuario) aplican igual.

### 4.6 Sincronización automática en Vercel

`vercel.json` registra un cron diario a las 09:00 UTC:

```json
{ "crons": [{ "path": "/api/cron/gmail-sync", "schedule": "0 9 * * *" }] }
```

- El endpoint exige `Authorization: Bearer $CRON_SECRET` y sincroniza las conexiones con
  `autoSync` activo.
- En **Hobby** los cron sólo pueden ser diarios. En **Pro** se puede bajar a cada hora cambiando el
  `schedule` (por ejemplo `0 * * * *`) y subiendo `maxDuration` si hay muchos correos.
- La sincronización manual está siempre disponible en Ajustes.

---

## 5. Modelo de datos y reglas de cálculo

Tablas principales: `User`, `Account`, `Income`, `BalanceAdjustment`, `Expense`, `CardInstallment`,
`CardPayment`, `CreditCard`, `Category`, `MerchantRule`, `RecurringBill`, `BillOccurrence`,
`SavingsGoal`, `SavingsContribution`, `StatementImport`, `GmailConnection`, `ProcessedGmailMessage`,
`SyncLog`.

### Reglas contables implementadas (probadas)

1. **Compra con tarjeta** ⇒ obligación (`CardInstallment`). No descuenta el saldo bancario.
2. **Pago del resumen** (`CardPayment`) ⇒ descuenta la cuenta y marca pagadas las cuotas del período.
   No se cuenta como consumo.
3. **Cuenta pagada con tarjeta** ⇒ se imputa al período del resumen; no descuenta el banco y no se
   duplica. Si el resumen del período ya está pago, el cargo deja de contarse.
4. **Cuotas** ⇒ cada una se imputa a su período (mes de vencimiento del resumen), no al mes de compra.
   El período se calcula con el cierre configurado y se puede corregir por cuota.
5. **Monedas** ⇒ UYU y USD se calculan por separado. No hay conversión ni suma entre monedas.
6. **Ahorro** ⇒ los aportes con cuenta descuentan el disponible; el ahorro programado se resta del
   margen proyectado. La asignación a objetivos es **por prioridad**, sin prometer dos veces el mismo
   dinero.
7. **Tarjeta sin moneda** ⇒ una tarjeta acepta consumos en pesos y en dólares (no tiene moneda propia).
   El pago se registra por la moneda de la obligación y se debita en pesos a la cotización configurada
   (Ajustes →
   Preferencias, por defecto $U 41,00). El pago guarda el importe de la obligación (USD) y el importe
   debitado de la cuenta (UYU), así el saldo bancario baja en pesos y las cuotas USD quedan saldadas.
   La cotización **no** consolida ni convierte los reportes: cada moneda sigue mostrándose por separado.
8. **Conciliación** ⇒ clave estable por operación (medio de pago + fecha + importe + comercio
   normalizado + cuotas). Gmail y resumen no crean un gasto si ya existe una coincidencia
   `exact`/`likely`; las coincidencias dudosas se muestran para que decidas.
9. **Cuentas recurrentes** ⇒ la frecuencia (mensual, bimestral, trimestral…) se cuenta desde el
   **primer mes de pago** elegido al crearla, no desde el mes actual. Si el primer mes es futuro, la
   cuenta no aparece como vencida antes de tiempo.
   Cada cuenta tiene un **porcentaje** (default 100%) para gastos compartidos: cargás el importe total y
   el saldo, las proyecciones y los totales usan sólo tu parte. El total y el porcentaje se muestran
   en la lista; el pago se registra con el importe total.
10. **Cuenta predeterminada** ⇒ una cuenta puede marcarse como predeterminada; se preselecciona en los
    formularios de gasto, cuenta fija, ingreso, ajuste, aporte y pago de resumen (si la moneda coincide).

### Períodos de tarjeta

- Compra **antes** del día de cierre → resumen de ese mes.
- Compra **el día de cierre o después** → resumen del mes siguiente.
- El período guardado es el **mes del vencimiento** (YYYY-MM).
- Si el vencimiento es anterior al cierre, cae en el mes siguiente.

### Cálculos de la pantalla principal

- **Disponible** = saldo inicial + ingresos cobrados + ajustes − gastos de débito/efectivo − pagos de
  resumen − cuentas pagadas desde la cuenta − aportes a objetivos.
- **Comprometido** = cuotas del resumen vigente (y vencidas impagas) + cuentas pendientes del mes.
- **Después de compromisos** = disponible − comprometido.
- **Ahorro posible** = ingresos del mes − tarjeta − cuentas − gastos − ahorro programado (nunca menor
  a cero para mostrar).
- **Proyección** = mes a mes con ingresos, cuotas, cuentas, gastos y ahorro; las cuentas variables se
  muestran como rango y hay escenario base/conservador/optimista. El primer mes parte del **saldo
  disponible** (incluye el monto inicial que cargaste) y la barra verde del gráfico muestra ese
  disponible + ingresos del mes.
- **Cierre estimado** = cierre proyectado del mes en curso: saldo inicial + ingresos − tarjeta −
  cuentas − gastos − ahorro programado. Es el número de la tarjeta "Cierre estimado".

Cuando falta un dato (sin ingresos, cuotas vencidas, importes variables sin valor real), la app lo
dice explícitamente y **no** presenta el número como exacto.

---

## 6. Importación de estado de cuenta

El parser de PDF lee el resumen **por coordenadas**, no por texto plano. Eso permite separar las dos
columnas de importe del resumen de Itaú (pesos y dólares) y no confundir monedas:

```
05/10/26                     ← cierre / emisión
19/10/26 16/11/26            ← vencimiento y próximo cierre
05 09 26 7061 OPENAI ... 20,00        ← columna dólares
20 05 26 7061 ZONA TECNO 5/12 3,33    ← cuota 5 de 12, dólares
02 09 26 7061 MERCADOLIBRE 2/10 107,80 ← columna pesos
SALDO CONTADO 28.702,49 229,22        ← total del resumen por moneda
```

- **Cuotas**: una línea `N/M` se toma como la cuota del resumen; se crean M cuotas, las N-1
  anteriores quedan pagadas (ya estaban en resúmenes previos) y las futuras quedan como compromiso.
- **Período del resumen**: es el mes del vencimiento (editable en el paso 2). Si pagás el resumen al
  mes siguiente, cambiá el período antes de importar; de ahí salen los meses de cada cuota.
- **Categorías**: se sugieren por reglas de comercio (`src/lib/categories-rules.ts`). No se asigna
  nada sin que lo veas, y podés recordar la elección por comercio.
- **Líneas omitidas**: pagos, saldos, ajustes de IVA, seguro de vida y notas de crédito no se importan
  como consumos. Se muestran con su motivo para que no desaparezcan sin explicación.
- **Total del resumen**: se guarda por moneda y se muestra en Tarjetas como referencia del importe a
  pagar. La deuda registrada puede ser mayor porque el banco ya aplicó pagos o créditos.
- **Tarjetas multi-moneda**: una tarjeta puede tener resumen en pesos y en dólares. Los pagos se
  registran por período **y** moneda, y cada uno salda sólo las cuotas de su moneda.



1. **Ajustes → Importar resumen** (o desde Tarjetas).
2. Elegir tarjeta y subir el PDF (máx. 10 MB) o pegar el texto, o cargar a mano.
3. Se muestra una **vista previa editable** con confiabilidad, cierre, vencimiento, total y filas,
   respetando el **orden del PDF**. Con el filtro "Agrupar cuotas" se ordenan primero los gastos
   puntuales y después las compras en cuotas.
4. Cada fila puede corregirse, excluirse o marcarse como "Incompleta" (queda para revisión).
5. Se detectan **posibles duplicados** contra gastos ya cargados (correo, manual, otro resumen).
6. Sólo se importa lo que confirmás. El PDF **no se guarda**; se conserva su hash SHA-256.

Si el PDF es una imagen escaneada o la extracción falla, la pantalla lo avisa y ofrece la carga
manual. **No se inventa** el formato del resumen de Itaú: el parser es heurístico y está aislado en
`src/lib/statement/parse.ts` para ajustarlo cuando haya ejemplos reales.

---

## 7. Pruebas

```bash
npm test          # 48 tests unitarios (motor, períodos, dinero, dedupe, parsers)
npm run typecheck
npm run build
node scripts/smoke.mjs   # E2E opcional con Edge/Chrome instalado
```

Cobertura de los puntos críticos:

| Área | Qué se verifica |
| --- | --- |
| Cuotas | Reparto sin perder centavos, período por cierre/vencimiento, compra el día de cierre, cambio de año, cuotas que no son idénticas. |
| Conciliación | Misma clave entre correo/manual/resumen, coincidencia exacta/probable, no duplicar entre tarjetas o monedas distintas, filas repetidas dentro de un mismo PDF. |
| Prevención de duplicados | Gmail no reimporta el mismo `messageId`; el resumen omite coincidencias `exact`/`likely`; el pago del resumen no se cuenta como gasto. |
| Saldos | Compra con tarjeta no toca el banco, pago de resumen descuenta una sola vez, cuentas con tarjeta no se duplican, monedas separadas. |
| Proyección | Mes en curso usa saldo real y no re-resta lo ya gastado; rangos variables; datos faltantes explícitos. |
| Objetivos | Asignación conjunta por prioridad, sin asignar el mismo margen dos veces. |
| Pago USD desde cuenta UYU | Convierte con la cotización configurada, debita pesos y salda la cuota en dólares. |
| Gastos compartidos | El porcentaje de la cuenta fija ajusta saldo, compromisos y proyección sin cambiar el total cargado. |
| Parsers | Extracción de avisos de consumo y de resúmenes, columnas pesos/dólares, cuotas N/M, líneas omitidas, datos faltantes e instrucciones sospechosas ignoradas. |

Resultado: **66/66 tests OK** y **build de producción OK**. El smoke test E2E (login → alta de gasto →
verificación de saldo → borrado → importación manual → estado "por revisar") pasó sin errores de
consola.

---

## 8. Subir a GitHub y desplegar en Vercel

```bash
git add .
git commit -m "Registro de gastos: app completa"
git remote add origin https://github.com/rasnad/registro-gastos.git
git push -u origin main
```

En Vercel:

1. **Add New → Project → Import Git Repository** y elegir el repo.
2. Framework: Next.js (autodetectado). Build: `npm run build` (incluye `prisma generate`).
3. Cargar las variables de entorno de §2 (con la `GOOGLE_REDIRECT_URI` de producción).
4. Agregar `https://TU-DOMINIO/api/gmail/callback` como redirect URI en Google Cloud.
5. Deploy.
6. Aplicar migraciones contra la base de producción:
   ```bash
   npm run db:apply
   ```
   (o `npx prisma migrate deploy` desde una red con 5432 habilitado).

   **Orden importante:** si la migración es **aditiva** (agrega columnas/tablas), se puede aplicar
   antes del deploy. Si **elimina o renombra** columnas, aplicarla **después** de que el deploy nuevo
   esté en producción: mientras corre el build, la versión anterior sigue consultando la columna y
   devuelve 500 (`P2022 column does not exist`). Para cambios destructivos conviene además un paso
   intermedio (columna nueva + backfill, deploy, y recién después borrar la vieja).
7. Crear los usuarios con `npm run user:create` (ver §1) y entrar por `/login`.

Notas:

- El cron de `vercel.json` requiere `CRON_SECRET` configurado en Vercel.
- `AUTH_SECRET` debe ser distinto en producción y no rotarse sin cerrar sesiones.
- No subir `.env`; usar la sección *Environment Variables* de Vercel.

---

## 9. Seguridad y privacidad

- Middleware + `requireUser()` en cada página y endpoint: sin sesión → `/login` (o 401 en `/api`).
- Todos los queries filtran por `userId`; nunca se acepta un `userId` del cliente.
- Validación de archivos (tipo, tamaño, firma `%PDF`), límite de filas importadas y validación
  server-side de cada fila.
- Tokens de Gmail cifrados en reposo; nunca se envían al navegador.
- El contenido de correos se trata como **no confiable**: sólo se extraen patrones; si el texto
  parece contener instrucciones, se marca una advertencia y se ignora.
- Sin logs de cuerpos de correo, importes ni tokens.
- `noindex` global: la app no se indexa.

Pendiente recomendado (no bloqueante): rate limiting del login y 2FA. Hoy la protección es
contraseña larga + cookie httpOnly; la app está pensada para uso personal.

---

## 10. Supuestos y decisiones

- **Categorías por reglas, no por IA.** `suggestCategoryName` mapea comercios frecuentes; si no hay
  coincidencia queda "Sin categorizar". La interfaz está preparada para reemplazarlo por un LLM más
  adelante (una sola función pura).
- **Tarjeta sin moneda fija.** El resumen de Itaú trae pesos y dólares en el mismo documento; la
  tarjeta no guarda una moneda y el pago del resumen es único por (tarjeta, período, moneda).
- **Próximos meses en Cuentas.** Al pasar el mouse (o enfocar) los tres totales muestran el detalle de
  las cuentas de ese mes; las que no son mensuales se resaltan en naranja suave.
- **Cotización para pagar, no para reportar.** La cotización (default 41,00) sólo define cuántos pesos
  salen de la cuenta al pagar un resumen en dólares. Si cambia, cambiá el valor y los próximos pagos
  usan el nuevo; los pagos ya registrados conservan la cotización con la que se hicieron.
- **Saldos históricos:** el pago guarda `accountAmount` (lo debitado) además del importe de la
  obligación; el saldo se calcula con lo debitado.

- **Sin conversión de moneda.** Para evitar cifras incorrectas, cada moneda se muestra y proyecta por
  separado. Un tipo de cambio explícito queda como mejora futura.
- **Un pago por resumen y período** (`CardPayment` único por tarjeta+período). Si el banco cobra
  parcial, se registra el importe real y todas las cuotas del período quedan saldadas; el detalle
  final se puede corregir por cuota.
- **Sin registro público**: los usuarios se dan de alta por consola (`scripts/create-user.ts`). Para
  una app de dos personas es más simple y más seguro que mantener un formulario de alta expuesto.
- **Sin edición de movimientos con cuotas pagadas** (importe/cuotas): se corrigen cuota por cuota para
  no romper la contabilidad.
- **El cron es diario** porque el plan Hobby de Vercel no permite más frecuencia.
- **El parser de Gmail y del PDF es heurístico** porque no se proveyeron ejemplos reales. Está aislado
  y testeado para adaptarlo sin tocar el resto.

---

## 11. Lo que falta de tu lado

0. **Crear la tarjeta** en Ajustes → Tarjetas (cierre y vencimiento reales) antes de importar el
   resumen, y elegir el período correcto en el paso 2 de la importación.

1. **Gmail:** crear el proyecto en Google Cloud, habilitar Gmail API, configurar la pantalla de
   consentimiento y el cliente OAuth, y pegar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y
   `GOOGLE_REDIRECT_URI`. Después conectar desde Ajustes.
2. **Ejemplos reales de correos de Itaú** (anonimizados): con ellos se ajustan los patrones de
   `src/lib/gmail/parser.ts` y se suben los tests.
3. **Un estado de cuenta real (PDF o texto anonimizado):** para calibrar
   `src/lib/statement/parse.ts` (columnas, cuotas, moneda) y validar la extracción.
4. **Decidir frecuencia de sincronización** (diaria en Hobby; horaria en Pro).
5. **Rotar la contraseña de Neon** compartida por chat y actualizar `DATABASE_URL` en Vercel.
6. Opcional: definir un tipo de cambio manual si querés ver un equivalente consolidado (hoy no existe
   a propósito).

---

## 12. Estructura

```
prisma/                 schema, migraciones y seed
scripts/                aplicar migraciones por HTTPS, seed demo, smoke E2E
src/app/                rutas (login, inicio, movimientos, tarjetas, proyección, ahorro, cuentas, ajustes)
src/app/actions/        server actions (validación + escritura)
src/app/api/            auth/logout, Gmail OAuth, cron
src/components/         shell, UI y formularios
src/lib/                dinero, períodos, auth, Prisma, engine, dedupe
src/lib/finance/        motor de cálculo puro + carga de datos
src/lib/gmail/          OAuth, cifrado, parser y sincronización
src/lib/statement/      extracción de PDF y parser de resúmenes
tests/                  vitest (48 tests)
```
