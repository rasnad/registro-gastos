import fs from 'node:fs'
import { spawn } from 'node:child_process'
import dotenv from 'dotenv'
import { neon } from '@neondatabase/serverless'

// Deliberadamente no usa .env de producción. Aborta ante otra rama.
const env = dotenv.parse(fs.readFileSync('.env.pagos.local'))
const expected = 'br-soft-sky-bej9rkuj'
const [identity] = await neon(env.DATABASE_URL).query("select current_setting('neon.branch_id', true) as branch")
if (identity.branch !== expected) throw new Error('La conexión no es la rama dev-pagos verificada. No se inició el servidor.')
console.log('Servidor móvil conectado exclusivamente a dev-pagos. Puerto 3001.')
const child = spawn(process.execPath, ['--dns-result-order=ipv4first', 'node_modules/next/dist/bin/next', 'dev', '-p', '3001', '-H', '0.0.0.0'], { env: { ...process.env, ...env }, stdio: 'inherit' })
child.on('exit', code => process.exit(code ?? 1))
