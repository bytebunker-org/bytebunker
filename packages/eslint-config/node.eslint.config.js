import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import eslintPluginN from 'eslint-plugin-n';

export default tseslint.config(
    {
        ignores: ['src/util/generated-library-mapped-types/*.ts', 'src/yond/type/generated/*.ts', 'src/metadata.ts']
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts', 'tools/**/*.ts'],
        extends: [
            eslintPluginPrettierRecommended,
            eslintPluginUnicorn.configs['flat/recommended'],
            eslintPluginN.configs['flat/recommended-script']
        ],
        plugins: {
            '@typescript-eslint': tseslint.plugin
        },
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: 'tsconfig.json'
            }
        },
        rules: {
            '@typescript-eslint/interface-name-prefix': 'off',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            'prettier/prettier': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', args: 'after-used' }],
            'require-await': 'warn',
            'no-return-await': 'warn',
            'unicorn/better-regex': 'warn',
            'n/no-missing-import': 'off',
            'n/no-unpublished-import': 'off',
            'unicorn/no-array-method-this-argument': 'off',
            'unicorn/prefer-top-level-await': 'off',
            'unicorn/no-null': 'off',
            'unicorn/no-array-callback-reference': 'off',
            'unicorn/prefer-ternary': 'off',
            'unicorn/explicit-length-check': 'off',
            'unicorn/no-for-loop': 'off',
            'unicorn/no-array-reduce': 'off',
            'unicorn/consistent-function-scoping': 'off',
            'unicorn/no-abusive-eslint-disable': 'off',
            'unicorn/no-await-expression-member': 'off',
            'unicorn/prefer-switch': 'off',
            'unicorn/switch-case-braces': 'off',
            // conflicts with prettier
            'unicorn/no-nested-ternary': 'off',
            'unicorn/prevent-abbreviations': 'off',
            'unicorn/filename-case': [
                'error',
                {
                    case: 'kebabCase',
                    ignore: [
                        // Migration filenames
                        /^\d+-\w+.ts/i
                    ]
                }
            ]
        }
    }
);
