import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { flagApiPlugin } from './server/flagApiPlugin';

export default defineConfig({
  plugins: [react(), tailwindcss(), flagApiPlugin()],
  server: {
    host: true,
    port: 5173,
  },
});
