import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.spec.ts'],
        environment: 'node',
        // `@Type()` and the class-validator decorators read design-time metadata, which only
        // exists once the polyfill is loaded. Nest does this in main.ts; a spec has no main.ts.
        setupFiles: ['reflect-metadata'],
    },
});
