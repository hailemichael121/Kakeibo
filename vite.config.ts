import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      exceljs: 'exceljs/dist/exceljs.min.js',
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: null,
  },
  build: { chunkSizeWarningLimit: 2800 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
