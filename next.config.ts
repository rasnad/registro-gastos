import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-neon',
    '@neondatabase/serverless',
    'bcryptjs',
    'googleapis',
  ],
  experimental: {
    serverActions: {
      // Los estados de cuenta se procesan en memoria; el archivo no se persiste.
      bodySizeLimit: '10mb',
    },
  },
}

export default nextConfig
