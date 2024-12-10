import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslintPluginSvelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import globals from 'globals';

export default (svelteConfig = undefined) =>
    tseslint.config(
        {
            ignores: []
        },
        eslint.configs.recommended,
        ...tseslint.configs.recommended,
        {
            languageOptions: {
                parser: tseslint.parser,
                parserOptions: {
                    sourceType: 'module',
                    extraFileExtensions: ['.svelte']
                },
                globals: { ...globals.browser }
            },
            rules: {
                'prettier/prettier': 'warn',
                '@typescript-eslint/ban-ts-comment': 'off',
                '@typescript-eslint/no-explicit-any': 'off',
                '@typescript-eslint/no-unused-vars': [
                    'warn',
                    {
                        argsIgnorePattern: '^_'
                    }
                ]
            }
        },
        eslintPluginPrettierRecommended,
        ...eslintPluginSvelte.configs['flat/recommended'],
        {
            files: ['*.svelte', '**/*.svelte', '**/*.svelte.ts', '*.svelte.ts', '**/*.svelte.js', '*.svelte.js'],
            languageOptions: {
                parser: svelteParser,
                parserOptions: { parser: tseslint.parser, svelteConfig }
            },
            rules: {
                'prettier/prettier': 'warn',
                '@typescript-eslint/no-explicit-any': 'off',
                'svelte/infinite-reactive-loop': 'warn',
                'svelte/no-at-html-tags': 'off',
                'svelte/block-lang': [
                    'error',
                    {
                        enforceScriptPresent: true,
                        enforceStylePresent: false,
                        script: ['ts'],
                        style: ['postcss', null]
                    }
                ],
                'svelte/valid-compile': ['error', { ignoreWarnings: true }],
                'svelte/no-immutable-reactive-statements': 'warn',
                'svelte/no-reactive-functions': 'warn',
                'svelte/no-reactive-literals': 'warn',
                'svelte/no-svelte-internal': 'error',
                'svelte/require-stores-init': 'warn',
                'svelte/valid-each-key': 'warn',
                'svelte/derived-has-same-inputs-outputs': 'warn',
                'svelte/html-self-closing': 'warn',
                'svelte/mustache-spacing': 'warn',
                'svelte/no-extra-reactive-curlies': 'warn',
                'svelte/no-spaces-around-equal-signs-in-attribute': 'warn',
                'svelte/shorthand-attribute': 'warn',
                'svelte/shorthand-directive': 'warn',
                'a11y-no-noninteractive-element-interactions': 'off'
            }
        }
    );
