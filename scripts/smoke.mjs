/**
 * Smoke test de UI (opcional). Requiere un navegador instalado (Edge o Chrome)
 * y la app corriendo en http://localhost:3000 con el usuario demo.
 *
 *   node scripts/smoke.mjs
 *
 * Variables: BASE_URL, CHROME_PATH, SMOKE_EMAIL, SMOKE_PASSWORD
 */
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

const executablePath = CANDIDATES.find((path) => existsSync(path))
if (!executablePath) {
  console.error('No se encontró un navegador. Definí CHROME_PATH.')
  process.exit(1)
}

const email = process.env.SMOKE_EMAIL ?? 'demo@registro.local'
const password = process.env.SMOKE_PASSWORD ?? 'demo-gastos-2025'
const marker = `Prueba E2E ${Date.now()}`

function assert(condition, message) {
  if (!condition) throw new Error(`FALLO: ${message}`)
  console.log(`ok · ${message}`)
}

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('dialog', (dialog) => dialog.accept())

try {
  // 1. Login
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.getByRole('button', { name: /Ingresar/ }).click()
  await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 })
  assert(await page.getByText('Disponible después de compromisos').count() > 0, 'el inicio muestra el saldo disponible')

  const availableBefore = await page.locator('.balance-value .money').first().innerText()

  // 2. Crear un gasto manual desde el diálogo
  await page.goto(`${BASE_URL}/movimientos?nuevo=1`, { waitUntil: 'networkidle' })
  const dialog = page.locator('.modal')
  await dialog.waitFor({ state: 'visible' })
  await dialog.locator('input[name="amount"]').fill('1234,56')
  await dialog.locator('input[name="merchant"]').fill(marker)
  await dialog.locator('select[name="categoryId"]').selectOption({ label: 'Comida' })
  const accountSelect = dialog.locator('select[name="accountId"]')
  const accountValue = await accountSelect.locator('option').nth(1).getAttribute('value')
  await accountSelect.selectOption(accountValue)
  await dialog.getByRole('button', { name: 'Registrar movimiento' }).click()
  await page.waitForURL(`${BASE_URL}/movimientos`, { timeout: 20000 })
  await page.waitForSelector(`text=${marker}`, { timeout: 20000 })
  assert(true, 'el gasto manual aparece en movimientos')

  // 3. Verificar que el saldo disponible bajó en el inicio
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
  const availableAfter = await page.locator('.balance-value .money').first().innerText()
  assert(availableBefore !== availableAfter, `el saldo disponible cambió (${availableBefore} → ${availableAfter})`)

  // 4. Eliminar el gasto de prueba
  await page.goto(`${BASE_URL}/movimientos?q=${encodeURIComponent(marker)}`, { waitUntil: 'networkidle' })
  const row = page.locator('.transaction', { hasText: marker })
  await row.getByRole('button', { name: 'Eliminar' }).click()
  await page.waitForTimeout(1500)
  assert(await page.locator(`text=${marker}`).count() === 0, 'el gasto de prueba se eliminó')

  // 5. Importación manual de un resumen
  await page.goto(`${BASE_URL}/ajustes/importar`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Manual', exact: true }).click()
  await page.getByRole('button', { name: /Empezar carga manual/ }).click()
  await page.waitForSelector('.import-grid')
  const importRow = page.locator('.import-row').first()
  await importRow.locator('input[placeholder="Comercio"]').fill(`Importado ${marker}`)
  await importRow.locator('input[placeholder="0,00"]').fill('777,00')
  await page.getByRole('button', { name: /Importar 1 compra/ }).click()
  await page.waitForSelector('text=Importación completada', { timeout: 30000 })
  assert(true, 'la importación manual confirmó correctamente')

  // 6. El gasto importado existe y está marcado para revisión por confianza baja
  await page.goto(`${BASE_URL}/movimientos?q=${encodeURIComponent('Importado')}`, { waitUntil: 'networkidle' })
  const importedRow = page.locator('.transaction', { hasText: 'Importado' }).first()
  await importedRow.waitFor({ timeout: 20000 })
  assert((await importedRow.innerText()).includes('Por revisar'), 'la fila importada queda para revisión')

  // limpieza
  await importedRow.getByRole('button', { name: 'Eliminar' }).click()
  await page.waitForTimeout(1200)

  assert(errors.length === 0, `sin errores de consola (${errors.slice(0, 3).join(' | ')})`)
  console.log('\nSmoke test OK')
} finally {
  await browser.close()
}
