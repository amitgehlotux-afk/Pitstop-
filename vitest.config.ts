import { defineConfig } from 'vitest/config';

process.env.TZ = 'Asia/Kolkata';
export default defineConfig({ test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' } });
