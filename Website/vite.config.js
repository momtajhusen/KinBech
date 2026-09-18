import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Let React Router handle page URLs; only proxy XHR/fetch API calls */
function apiProxy() {
  return {
    target: 'http://localhost:5001',
    changeOrigin: true,
    bypass(req) {
      const accept = req.headers.accept || '';
      // Browser navigation to /categories, /sellers, etc. must serve the SPA
      if (req.method === 'GET' && accept.includes('text/html')) {
        return '/index.html';
      }
    },
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      '/auth': apiProxy(),
      '/listings': apiProxy(),
      '/sellers': apiProxy(),
      '/categories': apiProxy(),
      '/shops': apiProxy(),
      '/notifications': apiProxy(),
      '/reports': apiProxy(),
      '/reviews': apiProxy(),
      '/chats': apiProxy(),
      '/wishlist': apiProxy(),
      '/map': apiProxy(),
      '/health': apiProxy(),
      '/uploads': { target: 'http://localhost:5001', changeOrigin: true },
    },
  },
  preview: {
    port: 4180,
    proxy: {
      '/auth': apiProxy(),
      '/listings': apiProxy(),
      '/sellers': apiProxy(),
      '/categories': apiProxy(),
      '/shops': apiProxy(),
      '/notifications': apiProxy(),
      '/reports': apiProxy(),
      '/reviews': apiProxy(),
      '/chats': apiProxy(),
      '/wishlist': apiProxy(),
      '/map': apiProxy(),
      '/health': apiProxy(),
      '/uploads': { target: 'http://localhost:5001', changeOrigin: true },
    },
  },
});
