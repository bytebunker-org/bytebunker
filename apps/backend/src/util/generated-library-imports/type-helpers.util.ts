import type { Constructable } from '../type/constructable.interface.js';

/**
 * @deprecated Don't use this in dto code! Always import from @nestjs/mapped-types or @nestjs/swagger. These classes are only used when exporting the browser compatible library
 */
export function inheritPropertyInitializers(
    target: Record<string, any>,
    sourceClass: Constructable<any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isPropertyInherited = (key: string) => true,
) {
    try {
        const temporaryInstance = new sourceClass();
        const propertyNames = Object.getOwnPropertyNames(temporaryInstance);

        for (const propertyName of propertyNames
            .filter(
                (propertyName) => temporaryInstance[propertyName] !== undefined && target[propertyName] === undefined,
            )
            .filter((propertyName) => isPropertyInherited(propertyName))) {
            target[propertyName] = temporaryInstance[propertyName];
        }
    } catch {}
}
