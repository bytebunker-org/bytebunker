import 'reflect-metadata';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Settings } from 'luxon';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppConfig } from './util/config/app.config.js';
import helmet from 'helmet';
import { configureSwaggerDocumentation } from './util/configure-swagger-docs.util.js';
import morgan from 'morgan';
import { DateTimeResponseInterceptor } from './util/date-time-response.interceptor.js';
import { parse } from '@bytebunker/qs-esm';
import { ExtendedExceptionFilter } from './database/util/extended-exception.filter.js';

// Set default luxon DateTime timezone to UTC instead of using the system timezone
Settings.defaultZone = 'utc';
const requestLogger = new Logger('Http');

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    app.enableShutdownHooks();

    const config = app.get(AppConfig);

    await configureSwaggerDocumentation(app);

    app.use(
        morgan('tiny', {
            stream: {
                write: (message: string) => requestLogger.log(message.replace('\n', '')),
            },
        }),
    );
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            forbidNonWhitelisted: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        }),
    );

    app.useGlobalInterceptors(new DateTimeResponseInterceptor());

    app.use(helmet());
    app.enableCors({
        origin: config.cors.endpoint,
        methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
        credentials: true,
    });

    const { httpAdapter } = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExtendedExceptionFilter(httpAdapter));

    if (config.nodeEnv !== 'development') {
        app.set('trust proxy', 1); // trust first proxy
    }

    app.set('query parser', (queryString: string) => {
        return parse(queryString, {
            allowDots: false,
            interpretNumericEntities: true,
            arrayLimit: 200,
        });
    });

    await app.listen(config.port, config.hostName, async () => {
        const url = await app.getUrl();

        Logger.log(`Listening on ${url}`);
        Logger.log(`Url for OpenApi: ${url}/docs`, 'Swagger');
    });
}

bootstrap().catch((error) => {
    console.error("Couldn't bootstrap NestJS application", error);
});
