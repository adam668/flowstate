import { defineWorkspace } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineWorkspace([
  {
    name: 'main',
    test: {
      environment: 'node',
      globals: true,
      include: ['src/main/**/*.test.ts', 'src/preload/**/*.test.ts']
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    }
  },
  {
    name: 'renderer',
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/renderer/**/*.test.ts', 'src/renderer/**/*.test.tsx'],
      setupFiles: ['./src/renderer/src/test-setup.ts']
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    }
  }
])
