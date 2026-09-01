import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SokoEats',
    short_name: 'SokoEats',
    description: 'Everything you need, delivered.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f9f8',
    theme_color: '#173f2f',
    icons: [
      { src: '/logo.png', sizes: '1024x1024', type: 'image/png' },
      { src: '/favicon.png', sizes: '1024x1024', type: 'image/png' },
    ],
  };
}
