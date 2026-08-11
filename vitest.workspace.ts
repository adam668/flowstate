import { defineWorkspace } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineWorkspace([
  {
    test: {
      name: 'main',
      environment: 'node',
      globals: true,
      // Pin the test timezone so local-day assertions are deterministic everywhere.
      // `pool: 'forks'` is required for the pin to bite: with the default worker-thread
      // pool, assigning process.env.TZ inside the worker does not flush V8's cached
      // timezone, so the host timezone would leak into local-day assertions.
      pool: 'forks',
      env: { TZ: 'UTC' },
      include: ['src/main/**/*.test.ts', 'src/preload/**/*.test.ts', 'src/shared/**/*.test.ts']
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    }
  },
  {
    plugins: [react()],
    test: {
      name: 'renderer',
      environment: 'jsdom',
      globals: true,
      // Pin the test timezone so local-day assertions are deterministic everywhere.
      // `pool: 'forks'` is required for the pin to bite: with the default worker-thread
      // pool, assigning process.env.TZ inside the worker does not flush V8's cached
      // timezone, so the host timezone would leak into local-day assertions.
      pool: 'forks',
      env: { TZ: 'UTC' },
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
