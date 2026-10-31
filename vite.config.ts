import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({plugins:[react()],build:{chunkSizeWarningLimit:700,rollupOptions:{output:{manualChunks:(id)=>id.includes('node_modules/three')?'three':id.includes('node_modules/react')?'react':undefined}}},test:{include:['tests/**/*.test.ts']}})
