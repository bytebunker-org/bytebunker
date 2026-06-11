import { TransformationType, type TransformFnParams } from 'class-transformer';
import { DateTime } from 'luxon';

export function dateTimeClassTransformer({ type, value }: TransformFnParams): DateTime | string {
    if (!value) {
        return value;
    }

    if (type === TransformationType.PLAIN_TO_CLASS) {
        const isoDateString = value as string;
        const transformedDate = DateTime.fromISO(isoDateString);

        return transformedDate.isValid ? transformedDate : value;
    } else if (type === TransformationType.CLASS_TO_PLAIN) {
        const date = value as DateTime;

        return date && DateTime.isDateTime(date) ? (date.toISO() ?? value) : value;
    } else {
        return value;
    }
}
