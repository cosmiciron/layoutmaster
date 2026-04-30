import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        'core/index': 'src/core/index.ts'
    },
    format: ['esm'],
    target: 'es2020',
    clean: true,
    dts: true,
    sourcemap: true,
    splitting: true,
    outDir: 'dist'
});
