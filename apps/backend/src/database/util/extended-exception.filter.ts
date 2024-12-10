import { type ArgumentsHost, type ExceptionFilter, type HttpServer, Logger } from '@nestjs/common';
import { NotFoundError } from '@mikro-orm/core';
import { AbstractHttpAdapter, BaseExceptionFilter } from '@nestjs/core';

export class ExtendedExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(ExtendedExceptionFilter.name);

    public override handleUnknownError(
        exception: any,
        host: ArgumentsHost,
        applicationRef: AbstractHttpAdapter | HttpServer,
    ) {
        if (exception instanceof NotFoundError) {
            const message = {
                statusCode: 404,
                message:
                    process.env['NODE_ENV'] === 'development'
                        ? exception.message?.replace(/\n\s+/g, ' ')?.replace(/\n/g, '')
                        : 'Not Found',
            };

            const response = host.getArgByIndex(1);

            if (applicationRef.isHeadersSent(response)) {
                applicationRef.end(response);
            } else {
                applicationRef.reply(response, message, 404);
            }

            return this.logger.error('Entity Not Found', exception);
        } else {
            return super.handleUnknownError(exception, host, applicationRef);
        }
    }
}
