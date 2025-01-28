import type { Constructable } from '../type/constructable.interface.js';
import { inheritPropertyInitializers } from './type-helpers.util.js';
import type { MappedType } from './mapped-type.interface.js';
import type { RemoveFieldsWithType } from './remove-fields-with-type.type.js';

/**
 * @deprecated Don't use this in dto code! Always import from @nestjs/mapped-types or @nestjs/swagger. These classes are only used when exporting the browser compatible library
 */
export function PickType<T, K extends keyof T>(classReference: Constructable<T>, keys: readonly K[]) {
    const isInheritedPredicate = (propertyKey: string) => keys.includes(propertyKey as K);

    abstract class PickClassType {
        constructor() {
            inheritPropertyInitializers(this, classReference, isInheritedPredicate);
        }
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    return PickClassType as MappedType<RemoveFieldsWithType<Pick<T, (typeof keys)[number]>, Function>>;
}
