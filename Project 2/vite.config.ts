import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `--mode https` serves over a self-signed certificate so phones on the LAN
// get a secure context (camera access requires HTTPS outside localhost).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
}));
