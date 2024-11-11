import type { Constructable } from '../type/constructable.interface.js';
import type { MappedType } from './mapped-type.interface.js';
import type { RemoveFieldsWithType } from './remove-fields-with-type.type.js';
import { inheritPropertyInitializers } from './type-helpers.util.js';

// https://stackoverflow.com/questions/50374908/transform-union-type-to-intersection-type
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

// Converts ClassRefs array `Constructable<Class>[]` to `Class[]` using `infer`
// e.g. `ClassRefsToConstructors<[Constructable<Foo>, Constructable<Bar>]>` becomes `[Foo, Bar]`
type ClassReferencesToConstructors<T extends Constructable[]> = {
    [U in keyof T]: T[U] extends Constructable<infer V> ? V : never;
};

// Firstly, it uses indexed access type `Class[][number]` to convert `Class[]` to union type of it
// e.g. `[Foo, Bar][number]` becomes `Foo | Bar`
// then, uses the `UnionToIntersection` type to transform union type to intersection type
// e.g. `Foo | Bar` becomes `Foo & Bar`
// finally, returns `MappedType` passing the generated intersection type as a type argument
type Intersection<T extends Constructable[]> = MappedType<
    RemoveFieldsWithType<UnionToIntersection<ClassReferencesToConstructors<T>[number]>, Function>
>;

/**
 * @deprecated Don't use this in dto code! Always import from @nestjs/mapped-types or @nestjs/swagger. These classes are only used when exporting the browser compatible library
 */
export function IntersectionType<T extends Constructable[]>(...classReferences: T) {
    abstract class IntersectionClassType {
        constructor() {
            for (const classReference of classReferences) {
                inheritPropertyInitializers(this, classReference);
            }
        }
    }

    const intersectedNames = classReferences.reduce((previous, reference) => previous + reference.name, '');
    Object.defineProperty(IntersectionClassType, 'name', {
        value: `Intersection${intersectedNames}`,
    });

    return IntersectionClassType as Intersection<T>;
}
