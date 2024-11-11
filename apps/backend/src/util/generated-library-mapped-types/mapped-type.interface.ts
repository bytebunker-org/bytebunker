import type { Constructable } from '../type/constructable.interface.js';

/**
 * @deprecated Don't use this in dto code! Always import from @nestjs/mapped-types or @nestjs/swagger. These classes are only used when exporting the browser compatible library
 */
export interface MappedType<T> extends Constructable<T> {
    new (): T;
}
