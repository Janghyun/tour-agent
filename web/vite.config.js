import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages 프로젝트 사이트는 https://<user>.github.io/<repo>/ 서브경로에서 서빙되므로
// 빌드 시 VITE_BASE=/<repo>/ 를 주입한다(에셋이 /<repo>/assets/... 로 나오게). 로컬 dev는 "/".
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
});
