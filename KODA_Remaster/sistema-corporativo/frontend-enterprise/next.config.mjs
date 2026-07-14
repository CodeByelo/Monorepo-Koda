/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Permitir acceso desde el dominio externo de Tailscale Funnel
  allowedDevOrigins: [
    'kodaserver.tail0b33a9.ts.net',
    '*.tail0b33a9.ts.net',
  ],
  // Compresión gzip automática en producción
  compress: true,
  // Optimización de imágenes
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 86400, // 24 horas de caché para imágenes
  },
  // Headers de caché para assets estáticos
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/(.*)\\.(png|jpg|jpeg|webp|avif|svg|ico|woff|woff2)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
