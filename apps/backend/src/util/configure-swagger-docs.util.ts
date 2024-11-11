import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import basicAuth from 'express-basic-auth';
import { SwaggerModule } from '@nestjs/swagger';
import { AppConfig } from './config/app.config.js';
import { hasOwn } from './util.js';

const SWAGGER_ENVS = new Set(['development', 'staging']);
const logger = new Logger();

export async function configureSwaggerDocumentation(app: INestApplication) {
    const { nodeEnv, swagger } = app.get(AppConfig);

    if (nodeEnv && SWAGGER_ENVS.has(nodeEnv)) {
        if (swagger?.httpAuthUser && swagger?.httpAuthPassword) {
            app.use(
                ['/docs', '/docs-json', '/docs-yaml'],
                basicAuth({
                    challenge: true,
                    users: {
                        [swagger.httpAuthUser]: swagger.httpAuthPassword,
                    },
                }),
            );
        }

        try {
            // @ts-ignore - file might not be generated, in which case we'll catch the error
            const document = await import('../../dist/swagger.json', { assert: { type: 'json' } });
            SwaggerModule.setup('/docs', app, document);
        } catch (error) {
            if (hasOwn(error, 'message')) {
                logger.warn(`Failed to load Swagger documentation: ${error.message} - is the file generated?`);
            }
        }
    }
}
