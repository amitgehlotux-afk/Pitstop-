import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, /api/* is proxied to `wrangler pages dev` (port 8788) so Functions and secrets stay server-side.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8788' } },
  build: { sourcemap: false, target: 'es2020' },
});
