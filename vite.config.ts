import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { host: true, port: 5181, strictPort: true },
  build: { target: 'esnext' },
})
