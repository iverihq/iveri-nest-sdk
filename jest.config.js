module.exports = {
    rootDir: 'src',
    moduleFileExtensions: ['js', 'json', 'ts'],
    // `@Type()` and the class-validator decorators read design-time metadata, which only
    // exists once the polyfill is loaded. Nest does this in main.ts; Jest has no main.ts.
    setupFiles: ['reflect-metadata'],
    testRegex: '.*\\.spec\\.ts$',
    // `.ts` only: `@iveri/contracts` resolves to its compiled `dist`, and handing already-built
    // JavaScript to ts-jest just makes it warn about `allowJs` on every run.
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
    },
    collectCoverageFrom: ['**/*.ts'],
    coverageDirectory: '../coverage',
    testEnvironment: 'node',
};
