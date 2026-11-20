import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // also listen on the office network (LAN), not only on this PC
    port: 5173,
    strictPort: true, // fail clearly if 5173 is taken instead of silently moving to another port
    // Frontend calls /api/...; Vite forwards it to Flask.
    proxy: { '/api': process.env.API_TARGET ?? 'http://localhost:5000' },
  },
})
