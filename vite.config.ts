import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative, so a build can be opened from any path — a subfolder, a static
  // host, or someone's own server — without rewriting asset URLs.
  base: './',
});
