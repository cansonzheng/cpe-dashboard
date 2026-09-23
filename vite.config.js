import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('mdui-'),
        },
      },
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png'],
      manifest: {
        name: 'CPE Dashboard',
        short_name: 'CPE Dashboard',
        description: '用于管理 CPE 设备的轻量控制面板',
        theme_color: '#006874',
        background_color: '#f5faf9',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'zh-CN',
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    host: '::',
    port: 5173,
    proxy: {
      '/api': 'http://[::1]:3100',
    },
  },
})
