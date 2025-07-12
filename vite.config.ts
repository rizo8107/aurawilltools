import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
  server: {
    proxy: {
      '/webhook-test': {
        target: 'https://backend-n8n.7za6uc.easypanel.host',
        changeOrigin: true,
      },
      '/webhook': {
        target: 'https://backend-n8n.7za6uc.easypanel.host',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  }
});