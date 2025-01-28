export class ApiError extends Error {
    constructor(
        message: string,
        public statusCode: number
    ) {
        super(message);
    }
}

export function isApiError(error: unknown): error is ApiError {
    return (
        !!error && typeof error === 'object' && Object.hasOwn(error, 'message') && Object.hasOwn(error, 'statusCode')
    );
}
