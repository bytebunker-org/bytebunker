import nodeEslintConfig from '@bytebunker/eslint-config/node.eslint.config.js';

export default [
    ...nodeEslintConfig,
    {
        // MikroORM names migration files after their class (Migration<timestamp>_<name>).
        files: ['src/database/migrations/*.ts'],
        rules: { 'unicorn/filename-case': 'off' },
    },
];
