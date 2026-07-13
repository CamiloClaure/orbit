import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // Rutas relativas → funciona en GitHub Pages bajo /<repo>/ sin saber el nombre del repo.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@orbit/shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
    },
  },
  server: {
    // scripts/boot-tunnel.sh picks free ports and exports them; plain `npm run dev`
    // keeps the 5173/3001 defaults and vite's usual fallback if 5173 is taken.
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: Boolean(process.env.WEB_PORT),
    // Same-origin dev proxy: cookies work with no CORS plugin needed on the API.
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT ?? 3001}`,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
    // Vite rejects non-localhost Host headers; scripts/boot-tunnel.sh serves the
    // app from a *.trycloudflare.com host. Not `true` — that opens DNS rebinding.
    allowedHosts: ['.trycloudflare.com'],
  },
})
