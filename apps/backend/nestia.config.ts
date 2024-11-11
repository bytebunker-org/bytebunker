import type { INestiaConfig } from '@nestia/sdk';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module.js';

export default {
    input: () => NestFactory.create(AppModule),
    swagger: {
        output: 'dist/swagger.json',
        beautify: true,
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Local Server',
            },
        ],
    },
} satisfies INestiaConfig;
