const { nest } = require('@iveri/eslint-config');

module.exports = [
    ...nest,
    {
        languageOptions: {
            parserOptions: { tsconfigRootDir: __dirname },
        },
    },
];
