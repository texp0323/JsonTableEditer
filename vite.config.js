
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
    base: '/JsonTableEditer/', // GitHub 저장소 이름을 여기에 입력하세요. 예: '/json-editor-app/'
    build: {
        outDir: 'docs' // 빌드 결과물이 생성될 폴더 (기본값)
    }
});