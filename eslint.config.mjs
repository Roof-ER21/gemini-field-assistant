import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import a11y from 'eslint-plugin-jsx-a11y';

// Start with the rebuilt surfaces. Expand this list as legacy panels are migrated;
// do not label the untouched application lint-clean.
export default [
  {
    files: [
      'components/HomePageRedesigned.tsx',
      'components/MobileFieldNav.tsx',
      'components/FieldSusanWelcome.tsx',
      'components/ConnectionStatus.tsx',
    ],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': tseslint.plugin, 'jsx-a11y': a11y },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.reduce(
        (rules, config) => ({ ...rules, ...config.rules }),
        {},
      ),
      ...a11y.configs.recommended.rules,
      'no-undef': 'off', // TypeScript owns identifier resolution.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name="style"]',
          message: 'Use the shared field stylesheet and design tokens, not inline styles.',
        },
      ],
    },
  },
];
