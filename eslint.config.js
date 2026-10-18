import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
export default [
  { ignores: ['node_modules/**', 'client/dist/**', 'docs/**', 'coverage/**'] },
  js.configs.recommended,
  { files: ['**/*.{js,jsx}'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser }, parserOptions: { ecmaFeatures: { jsx: true } } }, rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] } },
  { files: ['client/**/*.jsx'], plugins: { react }, rules: { 'react/jsx-uses-vars': 'error', 'react/jsx-uses-react': 'error' } },
  { files: ['server/tests/**/*.js'], languageOptions: { globals: globals.jest } }
];
