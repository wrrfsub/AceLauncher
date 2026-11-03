import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

/**
 * Strict CSP for packaged builds. The renderer talks to nothing but the preload bridge; images come
 * from mod/news CDNs over https. (Dev skips this because Vite's HMR needs inline scripts.)
 */
const csp: Plugin = {
  name: 'ace-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; connect-src 'none'; base-uri 'none'; form-action 'none'" />`,
    ),
}

// Main-process code uses relative `.ts` imports so the pure modules also run under `node --test`.
export default defineConfig({
  main: {
    build: { rollupOptions: { input: resolve('src/main/index.ts') } },
  },
  preload: {
    // Sandboxed preloads must be CommonJS.
    build: { rollupOptions: { input: resolve('src/preload/index.ts'), output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss(), csp],
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } },
  },
})
