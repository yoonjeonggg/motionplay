import { createHash } from 'node:crypto'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const DEFAULT_API_URL = 'http://localhost:8080'

/**
 * Adds a Content-Security-Policy <meta> to production builds. The API token
 * lives in localStorage, so the main defence against it being stolen is
 * making injected scripts unable to run: only our own bundle and the exact
 * inline theme script (by hash) may execute, and network access is limited
 * to this origin and the API.
 *
 * Build-only because the dev server relies on inline scripts and a websocket
 * for HMR. A real deployment should also send this (plus frame-ancestors,
 * which a <meta> can't set) as an HTTP header.
 */
function contentSecurityPolicy(apiUrl: string): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      const hashes = inlineScripts.map(
        ([, body]) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`,
      )
      const policy = [
        "default-src 'self'",
        // MediaPipe compiles its WASM at runtime.
        `script-src 'self' 'wasm-unsafe-eval' ${hashes.join(' ')}`,
        "style-src 'self'",
        `connect-src 'self' ${new URL(apiUrl).origin}`,
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
      ].join('; ')
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), contentSecurityPolicy(env.VITE_API_URL || DEFAULT_API_URL)],
  }
})
