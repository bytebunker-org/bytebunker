/**
 * Convert strings from `MACRO_CASE` to `camelCase`. Only converts values, which are in `MACRO_CASE`, by checking if there is an underscore `_`,
 * or if the whole string is uppercase for exceptions such as `PASSWORD`
 */
function convertMacroToCamelCase(value: string) {
    if (value.includes('_') || /^[A-Z]+$/.test(value)) {
        return value
            .toLowerCase()
            .replaceAll(/([_-][a-z])/g, (group) => group.toUpperCase().replace('-', '').replace('_', ''));
    } else {
        return value;
    }
}

export function normalizeConfig(
    configClass: { prototype: any } | undefined,
    config: Record<string, any>,
    depth = 0,
): Record<string, any> {
    const resultObject: Record<string, any> = {};

    if (Array.isArray(config)) {
        return config;
    }

    for (const [key, value] of Object.entries(config)) {
        const convertedKey = convertMacroToCamelCase(key);
        const expectedType = configClass
            ? Reflect.getMetadata('design:type', configClass.prototype, convertedKey)
            : undefined;

        if (Array.isArray(value)) {
            resultObject[convertedKey] = value.map((item) => {
                if (item && typeof item === 'object') {
                    return normalizeConfig(expectedType, item, depth + 1);
                } else {
                    return item;
                }
            });

            continue;
        }

        // Arrays are sometimes of typeof "object". Just ignore them and don't try to forcibly convert them to an object
        if (typeof value === 'object' && expectedType !== Array) {
            const normalizedObject = normalizeConfig(expectedType, value, depth + 1);

            Object.assign(resultObject, resultObject[convertedKey]);
            resultObject[convertedKey] = normalizedObject;
        } else if (typeof value === 'string') {
            if (expectedType === Number) {
                resultObject[convertedKey] = Number.parseFloat(value);
            } else if (expectedType === Boolean) {
                resultObject[convertedKey] = /^true|1|ye?s?$/i.test(value);
            } else {
                resultObject[convertedKey] = value;
            }
        } else {
            resultObject[convertedKey] = value;
        }
    }

    if (configClass) {
        const resultObjectInstance = Object.create(configClass.prototype);

        if (typeof resultObject === 'object') {
            Object.assign(resultObjectInstance, resultObject);
        }

        return resultObjectInstance;
    }

    return resultObject;
}
