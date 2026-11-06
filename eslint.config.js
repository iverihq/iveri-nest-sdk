import { nest } from '@iveri/eslint-config';

export default [...nest, { languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } }];
