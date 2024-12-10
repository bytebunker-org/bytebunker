import type { ValidationArguments, ValidationOptions } from 'class-validator';
import { registerDecorator } from 'class-validator';
import { DateTime } from 'luxon';

export function isDateTime(value: unknown): value is DateTime<true> {
    return DateTime.isDateTime(value) && value.isValid;
}

export function IsDateTime(validationOptions?: ValidationOptions) {
    // eslint-ignore-next-line @typescript-eslint/no-wrapper-object-types
    return (object: object, propertyName: string) =>
        registerDecorator({
            name: 'isDateTime',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [],
            options: validationOptions,
            validator: {
                validate: isDateTime,
                defaultMessage(validationArguments?: ValidationArguments): string {
                    return `${validationArguments?.property} must be a valid ISO 8601 date-time string`;
                }
            }
        });
}
