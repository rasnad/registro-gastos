/**
 * Genera los secretos que necesita el despliegue, sin comillas para pegar
 * directo en Vercel (Settings → Environment Variables).
 *
 *   npm run env:secrets
 */
import { randomBytes } from 'node:crypto'

const auth = randomBytes(48).toString('base64')
const tokenKey = randomBytes(32).toString('base64')
const cron = randomBytes(24).toString('hex')

console.log('')
console.log('Pegá cada valor en Vercel → Settings → Environment Variables')
console.log('(sin comillas; tildá Production, Preview y Development)')
console.log('')
console.log(`AUTH_SECRET=${auth}`)
console.log(`TOKEN_ENCRYPTION_KEY=${tokenKey}`)
console.log(`CRON_SECRET=${cron}`)
console.log('')
console.log('Son secretos: no los commitees ni los mandes por chat.')
console.log('Si rotás AUTH_SECRET se cierran todas las sesiones (hay que volver a entrar).')
console.log('')
