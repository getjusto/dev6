import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'
import { withExternalBuiltins } from 'vite-plugin-electron'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: withExternalBuiltins({
          build: {
            lib: {
              entry: 'electron/main.ts',
              formats: ['cjs'],
            },
            rollupOptions: {
              external: ['electron-updater', '@homebridge/node-pty-prebuilt-multiarch'],
              output: {
                entryFileNames: '[name].cjs',
              },
            },
          },
        }),
      },
      preload: {
        input: 'electron/preload.ts',
        vite: withExternalBuiltins({
          build: {
            lib: {
              entry: 'electron/preload.ts',
              formats: ['cjs'],
            },
            rollupOptions: {
              output: {
                entryFileNames: '[name].cjs',
              },
            },
          },
        }),
      },
    }),
  ],
  server: {
    port: 4932,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
