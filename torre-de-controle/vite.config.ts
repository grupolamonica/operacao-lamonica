import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

/**
 * Vite config — Phase 6 / plan 06-07.
 *
 *   - `build.sourcemap: 'hidden'`         — generates source maps but does
 *                                           NOT add the `//# sourceMappingURL`
 *                                           reference in JS output (Pitfall #5).
 *   - `sentryVitePlugin`                  — uploads maps to Sentry then
 *                                           deletes them from dist so the
 *                                           CDN never ships .map files
 *                                           (mitigates T-06.07-01).
 *   - `sentryVitePlugin.disable`          — skipped silently in dev/CI when
 *                                           SENTRY_AUTH_TOKEN is unset; the
 *                                           build still produces hidden maps
 *                                           locally for debugging.
 *   - `rollupOptions.output.manualChunks` — splits heavy third-party libs
 *                                           into stable named vendor chunks
 *                                           (cache-busting friendly) (D-26).
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    sentryVitePlugin({
      org:        process.env.SENTRY_ORG,
      project:    process.env.SENTRY_PROJECT,
      authToken:  process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: { filesToDeleteAfterUpload: ['**/*.map'] },
      disable:    !process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'chart-vendor': ['chart.js', 'react-chartjs-2'],
          'map-vendor':   ['maplibre-gl'],
          'query-vendor': ['@tanstack/react-query', '@tanstack/react-table'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
