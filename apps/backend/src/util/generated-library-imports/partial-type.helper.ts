import type { Constructable } from '../type/constructable.interface.js';
import type { MappedType } from './mapped-type.interface.js';
import type { RemoveFieldsWithType } from './remove-fields-with-type.type.js';
import { inheritPropertyInitializers } from './type-helpers.util.js';

/**
 * @deprecated Don't use this in dto code! Always import from @nestjs/mapped-types or @nestjs/swagger. These classes are only used when exporting the browser compatible library
 */
export function PartialType<T>(classReference: Constructable<T>) {
    abstract class PartialClassType {
        constructor() {
            inheritPropertyInitializers(this, classReference);
        }
    }

    Object.defineProperty(PartialClassType, 'name', {
        value: `Partial${classReference.name}`,
    });

    // eslint-disable-next-line @typescript-eslint/ban-types
    return PartialClassType as MappedType<RemoveFieldsWithType<Partial<T>, Function>>;
}
