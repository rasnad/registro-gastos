import 'server-only'
import { google } from 'googleapis'

export const GMAIL_SCOPES = [
  // Sólo lectura de mensajes. No se solicita envío, borrado ni acceso al perfil.
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid',
  'email',
]

export function isGmailConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI,
  )
}

export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
}

export function buildAuthUrl(state: string): string {
  const client = oauthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_SCOPES,
    include_granted_scopes: true,
    state,
  })
}

export async function exchangeCode(code: string) {
  const client = oauthClient()
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) {
    throw new Error(
      'Google no devolvió un refresh token. Revocá el acceso de la app en tu cuenta de Google y volvé a conectar.',
    )
  }
  return tokens
}

export function gmailForRefreshToken(refreshToken: string) {
  const client = oauthClient()
  client.setCredentials({ refresh_token: refreshToken })
  return google.gmail({ version: 'v1', auth: client })
}

export function allowedSenderDomains(): string[] {
  return (process.env.GMAIL_ALLOWED_SENDER_DOMAINS ?? 'itau.com.uy,itau.com')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
}

export function senderMatchesAllowed(from: string): boolean {
  const match = /<([^>]+)>/.exec(from)
  const address = (match ? match[1] : from).trim().toLowerCase()
  const domain = address.split('@')[1] ?? ''
  return allowedSenderDomains().some(
    (allowed) => domain === allowed || domain.endsWith(`.${allowed}`),
  )
}

type GmailPayload = {
  mimeType?: string | null
  body?: { data?: string | null } | null
  parts?: GmailPayload[] | null
}

function decode(base64Url: string): string {
  return Buffer.from(base64Url.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]{2,}/g, ' ')
}

/** Extrae texto plano del mensaje. Prefiere text/plain; si no, limpia el HTML. */
export function extractMessageText(payload: GmailPayload | null | undefined): string {
  if (!payload) return ''
  let plain = ''
  let html = ''

  const walk = (part: GmailPayload) => {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      plain += `\n${decode(part.body.data)}`
    } else if (part.mimeType === 'text/html' && part.body?.data && !plain) {
      html += `\n${stripHtml(decode(part.body.data))}`
    }
    for (const child of part.parts ?? []) walk(child)
  }

  walk(payload)
  return (plain || html).replace(/\r/g, '').trim().slice(0, 20_000)
}
