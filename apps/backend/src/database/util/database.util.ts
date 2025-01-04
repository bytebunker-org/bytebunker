import { toSnakeCase } from 'js-convert-case';

export function toDatabaseEnumName(enumName: string) {
    if (!enumName.endsWith('Enum')) {
        throw new Error(`${enumName} is not a valid enum name`);
    }

    return toSnakeCase(enumName);
}
