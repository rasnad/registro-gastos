# iPhone — arquitectura, ejecución y estado

Rama `codex/feature-ios-expo`, creada desde `main` (`54d53c0`).

## Arquitectura auditada

Expo SDK 58 + React Native + TypeScript + Expo Router. Interfaz nativa, sin WebView.
Capacitor se descartó porque reutiliza la interfaz web, mientras que el objetivo es
navegación nativa y Next depende de Server Components, Server Actions y sesión propia.

| Módulos | Tratamiento |
| --- | --- |
| `finance/engine.ts`, `obligations.ts`, `money.ts`, `period.ts` | Motor existente sin cambios, ejecutado en servidor. |
| `finance/data.ts` | Misma carga por usuario y normalización a centavos. |
| `app/actions/*` | Adaptadores web con `requireUser()`, delegan a servicios. |
| `lib/services/*` | Operaciones extraídas de las acciones; usuario explícito, mismas validaciones y revalidación web. |
| `auth.ts`, `session.ts` | Se conserva la sesión web. |
| `lib/mobile/*`, `api/mobile/v1/*` | API, DTO, sesión nativa y protección de reintentos. |
| Componentes web | Reemplazados en móvil por componentes React Native, tabs, modales, fechas y teclados nativos. |
| Gmail/PDF | Procesamiento sigue en backend; OAuth y selección/importación PDF móvil pendientes. |
| Prisma | Tres tablas aditivas, sin cambiar tablas financieras. |

`mobile/` tiene instalación y lockfile independientes. Next excluye ese directorio
del typecheck. `src/lib/mobile/contracts.ts` se comparte mediante imports de tipo:
Prisma, credenciales y servicios no se incluyen en el bundle móvil.

## Primera etapa implementada

- Login con usuarios existentes, SecureStore/Keychain, renovación y revocación.
- Inicio con saldo, disponible, compromisos, cuentas y vencimientos; cambio de mes.
- Gastos CRUD, confirmación, cuotas, filtros de mes/comercio/estado/moneda/medio/categoría
  y páginas de 30 registros. Ingresos desde Más → Ajustes.
- Tarjetas: alta/edición, resumen por moneda, total original, pagado, pendiente y cuotas del mes.
- Cuentas: alta/edición, frecuencia, porcentaje, importe real y detalle del período.
- Pagos independientes: parciales/completos, múltiples pagos, historial, edición y
  eliminación. Históricos: edición/eliminación de pagos de tarjeta y reversión de
  pagos históricos de cuenta mediante los servicios existentes.
- Pantallas iniciales conectadas de proyección UYU y ahorro programado, objetivos,
  aportes, ingresos, cuentas, cotización y categorías.
- Estado Gmail, sincronización manual y activar/desactivar automática.
- Pull-to-refresh, recarga al volver a primer plano, errores y cache en memoria.

**Es una primera etapa funcional, no la adaptación completa del documento original.**
Las pantallas complementarias todavía no tienen paridad completa con la web.

## API v1

Base `/api/mobile/v1`; respuestas privadas sin cache.

| Ruta | Entrada / salida |
| --- | --- |
| `POST /auth/login` | `{email,password}` → par de tokens y `expiresIn` |
| `POST /auth/refresh` | `{refreshToken}` → nuevo par, invalida el anterior |
| `POST /auth/logout` | Bearer → revoca esta sesión |
| `GET /snapshot?period=YYYY-MM&includeSavings=true` | DTO con resultados del motor, opciones e historiales |
| `GET /movements?page=1` | 30 gastos; filtros `from`, `to`, `search`, `currency`, `source`, `status`, `categoryId` |
| `POST /commands` | `{command,fields: Record<string,string>}`, con `Idempotency-Key` obligatorio |

Respuesta `{data:T}` o `{error:{code,message}}`. Los errores de dominio conservan
`data.error`, que el cliente presenta en el formulario. Lecturas monetarias en
centavos enteros; comandos monetarios como strings decimales, nunca floats JSON.

Comandos definidos en una lista explícita; no se acepta `userId` del cliente ni
creación de pagos legacy. Zod valida el sobre y los servicios validan dominio y
propiedad. Todos los handlers consultan la sesión nativa; una cookie web no autoriza
esta API. Los errores internos de Prisma no se devuelven al teléfono.

Tokens opacos de 256 bits, sólo hashes SHA-256 en DB. Acceso 15 minutos, renovación
hasta 30 días desde login; rotación atómica y logout con revocación inmediata.
Login limitado por email normalizado a 10 intentos/15 minutos en DB. `AUTH_SECRET`
anonimiza las claves del contador; no se copia a Expo.

Cada comando reserva una clave por usuario y hash del contenido. Repetir la misma
solicitud devuelve el resultado guardado. Cambiar el cuerpo con la misma clave falla.
Si el proceso cae sin registrar resultado, queda pendiente y no se ejecuta de nuevo:
se debe verificar el historial antes de registrar otra operación. No hay escrituras
offline ni reenvío automático por fallos de red. Los reintentos tras renovar el token
conservan su clave. Cache financiero sólo en memoria y se borra al cerrar sesión.
HTTPS obligatorio en distribución; HTTP sólo se admite en modo desarrollo.

## Desarrollo e iPhone

Se verificó `dev-pagos`, ID `br-soft-sky-bej9rkuj`. Se aplicó allí exclusivamente
`20261111120000_mobile_sessions`: `MobileSession`, `MobileRequest`, `MobileLoginLimit`.
No se migró ni se probó sobre `production` (`br-green-glitter-be2saaiv`).

En la raíz:

```powershell
npm install
npm run dev:mobile
```

`dev:mobile` lee `.env.pagos.local`, comprueba el ID de la rama y arranca Next en
`0.0.0.0:3001`. Next completa las otras variables desde `.env.local`. No aplica
migraciones y aborta si encuentra otra rama.

En otra terminal:

```powershell
cd mobile
npm ci
# Crear .env.local a partir de .env.example con la IP LAN de la PC:
# EXPO_PUBLIC_API_URL=http://192.168.0.88:3001
npx expo start --go --lan
```

iPhone y PC en la misma red. Escanear el QR y abrir con Expo Go compatible con SDK
58. Si la versión instalada de Expo Go no es compatible, usar development build.
Actualizar la IP si cambia la red; `localhost` desde iPhone apunta al teléfono.
La única variable pública es la URL del backend; nunca copiar credenciales Neon.

## EAS

Perfiles development/preview/production preparados en `eas.json`, con
`expo-dev-client`. Bundle ID inicial `com.rasnad.registrogastos`.

```powershell
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform ios --profile development
```

Requiere cuenta Expo, vincular el proyecto y credenciales Apple para firmar e instalar
en dispositivo. Configurar `EXPO_PUBLIC_API_URL` del entorno EAS con un backend de
pruebas HTTPS. No se generó IPA ni se publicó en TestFlight. Publicar en producción
requiere revisión y autorización separada de la migración y despliegue coordinado.

## Validación y comandos

- 159 tests: 141 existentes + 18 nuevos de sesiones, API y reintentos.
- Typecheck web/móvil; lint Expo; Expo Doctor 20/20; export iOS/Hermes.
- Build de producción Next completado, incluida la generación de Prisma en Windows.
- Smoke real en `dev-pagos`: dos usuarios temporales, login y aislamiento,
  movimientos CRUD, pagos parciales/completos, varias cuentas, USD/UYU, editar y
  eliminar, conservar total, cambio de mes, idempotencia, renovar/revocar sesión.
- Páginas web inicio/tarjetas/cuentas/movimientos responden 200 con cookie habitual.
- Fixtures eliminados al terminar. Sin cambios a datos personales ni a producción.

```powershell
npm test
npm run typecheck
# Con dev:mobile ejecutándose:
node --import tsx scripts/mobile-smoke.ts
# Detener dev antes del build: comparten .next y Prisma en Windows.
npm run build
cd mobile
npm run typecheck
npm run lint
npx expo-doctor
npm run export:ios
```

## Pendiente

1. Prueba física en iPhone: formularios, navegación, accesibilidad, sesión al reabrir
   y pérdida de red. Exportar el bundle no equivale a validar el dispositivo.
2. Gmail OAuth con retorno seguro y PDF desde Archivos con vista previa/conciliación.
3. Gráficas nativas, futuros resúmenes/edición de cuotas y paridad de ajustes/ahorro,
   revisión de correos sin gasto y duplicados.
4. Face ID, recordatorios y modo oscuro si corresponde.
5. Optimizar historiales grandes: snapshot inicial reutiliza la carga web. Agregar
   mantenimiento de contadores y sesiones vencidas.
6. EAS firmado y TestFlight.

Referencias: [Expo Router](https://docs.expo.dev/router/installation/),
[SDK 58](https://docs.expo.dev/versions/v58.0.0/),
[SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/).
