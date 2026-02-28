import sharedConfig from '@josh803316/shared-config/eslint.config.js';

export default [
  ...sharedConfig,
  {ignores: ['dist/', 'node_modules/']},
];
