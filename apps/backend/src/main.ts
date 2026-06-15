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
import { parse } from '@bytebunker/qs-esm';
import { ExtendedExceptionFilter } from './database/util/extended-exception.filter.js';

// Set default luxon DateTime timezone to UTC instead of using the system timezone
Settings.defaultZone = 'utc';
const requestLogger = new Logger('Http');
const processLogger = new Logger('Process');

// Last-resort safety net: a rejected promise that nobody awaited (e.g. a fire-and-forget pipeline
// trigger handler) would otherwise terminate the process with `triggerUncaughtException`. Log it and
// keep the server running - a single failed pipeline must not take down the whole backend.
process.on('unhandledRejection', (reason) => {
    processLogger.error('Unhandled promise rejection - keeping the process alive', reason);
});

// An uncaught synchronous exception can leave the process in an undefined state, so we log it loudly.
// We deliberately keep running here too: the same resilience requirement applies, and Nest's shutdown
// hooks still run on real fatal signals.
process.on('uncaughtException', (error) => {
    processLogger.error('Uncaught exception - keeping the process alive', error);
});

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

    // TODO: Enable the mikro-orm serialization interceptor?
    // app.useGlobalInterceptors(new MikroOrmSerializationResponseInterceptor());

    app.use(
        helmet({
            // TODO: Re-enable! But this should support the bullmq /queues dashboard
            contentSecurityPolicy: false,
        }),
    );
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
