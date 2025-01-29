import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import basicAuth from 'express-basic-auth';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppConfig } from './config/app.config.js';

const SWAGGER_ENVS = new Set(['development', 'staging']);
const logger = new Logger('SwaggerDocumentation');

export async function configureSwaggerDocumentation(app: INestApplication) {
    const { nodeEnv, swagger } = app.get(AppConfig);

    let metadata: (() => Promise<Record<string, any>>) | undefined;

    try {
        // @ts-ignore file might not have been generated yet. Problem being, the build step to generate it doesn't work if the file is missing, so a dynamic-import with ts-ignore works better here
        metadata = (await import('../metadata.js')).default;
    } catch {
        logger.error("Can't load swagger metadata");
    }

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

        if (metadata) {
            try {
                await SwaggerModule.loadPluginMetadata(metadata);
            } catch (error) {
                logger.warn('Failed to load swagger metadata', error);
            }
        }

        const document = SwaggerModule.createDocument(
            app,
            new DocumentBuilder()
                .setTitle('ByteBunker Backend')
                .setVersion('1.0')
                .addCookieAuth('sid')
                .addTag('Auth', 'User management and authentication via cookies')
                .addTag('Health', 'Health checks of the backend, used by the Docker deployment')
                .setContact('Moritz Hein', 'https://moritz.website', 'moritz.hein@live.de')
                .build(),
        );
        SwaggerModule.setup('/docs', app, document);

        logger.log('Loaded swagger docs metadata');
    }
}
