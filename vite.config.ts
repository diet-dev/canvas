import {defineConfig} from "vite";
import {fileURLToPath} from "node:url";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: "demo",
  // Демо собирает пакет из исходников — то же имя, что у публикуемого пакета
  resolve: {
    alias: [{find: /^@dietdev\/canvas$/, replacement: path("src/index.ts")}],
  },
  build: {
    outDir: "../dist-demo",
    emptyOutDir: true,
  },
});
