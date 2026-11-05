import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './', // GitHub Pages 會放在 /<repo名稱>/ 底下，用相對路徑最安全
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '收藏帳本',
        short_name: '收藏帳本',
        lang: 'zh-Hant',
        display: 'standalone',
        background_color: '#14161c',
        theme_color: '#14161c',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
})
