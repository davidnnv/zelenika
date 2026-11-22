import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { CSP, HEADERS } from './security-headers.js';

// Adds the Content-Security-Policy as a <meta> tag in production builds only
// (the dev server needs inline scripts for hot reload).
const cspMeta = {
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP.replace("; frame-ancestors 'none'", '')}" />`),
};

export default defineConfig({
  plugins: [react(), cspMeta],
  build: {
    sourcemap: false, // don't publish the original source code
  },
  preview: { headers: HEADERS },
});
