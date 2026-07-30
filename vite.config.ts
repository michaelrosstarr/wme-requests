import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Vite dev's own CORS middleware intercepts OPTIONS before it reaches the Worker; without this,
  // it restricts Access-Control-Allow-Origin during `vite dev`, unlike the deployed Worker (whose
  // CORS headers come entirely from src/lib/http.ts via ALLOWED_ORIGINS).
  server: { cors: { origin: '*' } },
  plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), tanstackStart(), viteReact()],
})

export default config
