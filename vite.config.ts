import { defineConfig } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const devHost = process.env.VITE_DEV_HOST ?? "127.0.0.1";
const devPort = Number(process.env.VITE_DEV_PORT ?? 5173);
const previewHost = process.env.VITE_PREVIEW_HOST ?? "127.0.0.1";
const previewPort = Number(process.env.VITE_PREVIEW_PORT ?? 4173);

export default defineConfig({
  server: {
    host: devHost,
    port: devPort,
    strictPort: false,
  },
  preview: {
    host: previewHost,
    port: previewPort,
    strictPort: false,
  },
  build: {
    sourcemap: false,
    minify: "esbuild",
    target: "es2020",
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['lucide-react', 'sonner', 'cmdk'],
          'vendor-charts': ['recharts'],
          'vendor-excel': ['xlsx'],
          'vendor-utils': ['date-fns']
        }
      }
    }
  },
  plugins: [
    react(),
    ...(process.env.NODE_ENV === "development" ? [dyadComponentTagger()] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
