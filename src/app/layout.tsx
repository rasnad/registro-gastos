import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'

const dmSans = localFont({
  src: [
    { path: './fonts/dm-sans-latin.woff2', weight: '400 700', style: 'normal' },
    { path: './fonts/dm-sans-latin-ext.woff2', weight: '400 700', style: 'normal' },
  ],
  variable: '--font-dm-sans',
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'sans-serif'],
})

export const metadata: Metadata = {
  title: {
    default: 'Registro de gastos',
    template: '%s · Registro de gastos',
  },
  description: 'Tus gastos, tarjetas, cuotas, cuentas fijas y objetivos de ahorro en un solo lugar.',
  robots: { index: false, follow: false },
  applicationName: 'Registro de gastos',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Registro',
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#f8f8f6',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-UY" className={dmSans.variable}>
      <body>{children}</body>
    </html>
  )
}
