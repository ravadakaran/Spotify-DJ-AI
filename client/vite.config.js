import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()], server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3000', '/socket.io': {
  target: 'http://127.0.0.1:3000', ws: true,
  configure(proxy) {
    proxy.on('proxyReq', (outgoing, incoming) => {
      // Browsers omit Origin on same-origin polling GETs. Preserve explicit
      // origins; normalize only browser-declared same-origin GET requests.
      if (incoming.method === 'GET' && !incoming.headers.origin && incoming.headers['sec-fetch-site'] === 'same-origin') {
        outgoing.setHeader('Origin', `http://${incoming.headers.host}`);
      }
    });
  },
} } } });
