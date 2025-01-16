import { CreateHoldExecutionDto } from '../dto/create-hold-execution.dto.js';

export function holdExecution(): HoldExecutionBuilder {
    return new HoldExecutionBuilder();
}

/**
 * @internal
 */
export class HoldExecutionBuilder {
    protected logStatusCode = 500;
    protected logMessage = '';
    protected logData?: Record<string, unknown>;
    protected logError?: Error;
    protected isAbort = false;
    protected isUnexpected = false;

    public abortExecution(): HoldExecutionBuilder {
        this.isAbort = true;

        return this;
    }

    public unexpected(): HoldExecutionBuilder {
        this.isUnexpected = true;

        return this;
    }

    public statusCode(statusCode: number): HoldExecutionBuilder {
        this.logStatusCode = statusCode;

        return this;
    }

    public message(message: string): HoldExecutionBuilder {
        if (message.length > 255) {
            console.warn(`Log message is longer than 255 characters: ${message}`);

            message = message.slice(0, 252) + '...';
        }

        this.logMessage = message;

        return this;
    }

    public data(data: Record<string, unknown>): HoldExecutionBuilder {
        this.logData = data;

        return this;
    }

    public error(error: Error): HoldExecutionBuilder {
        this.logError = error;

        return this;
    }

    public log({
        statusCode,
        message,
        data,
        error,
    }: {
        statusCode?: number;
        message?: string;
        data?: Record<string, unknown>;
        error?: Error;
    }): HoldExecutionBuilder {
        this.logStatusCode = statusCode ?? 500;
        this.message(message ?? '');
        this.logData = data;
        this.logError = error;

        return this;
    }

    public build(): CreateHoldExecutionDto {
        return new CreateHoldExecutionDto({
            executionLog: {
                statusCode: this.logStatusCode,
                message: this.logMessage,
                data: this.logData,
                error: this.logError,
            },
            isUnexpectedError: this.isUnexpected,
            isAbort: this.isAbort,
        });
    }
}
