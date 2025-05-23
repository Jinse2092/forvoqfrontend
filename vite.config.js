import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    cors: true,
    // Removed Cross-Origin-Embedder-Policy header to test if it causes loading issues
    // Temporarily removed allowedHosts and proxy to isolate issue
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.jsx', '.js', '.tsx', '.ts', '.json'],
  },
});
