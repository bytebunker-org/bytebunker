/**
 * Generic types for class definitions.
 * Example usage:
 * ```
 * function createSomeInstance(myClassDefinition: Constructable<MyClass>) {
 *   return new myClassDefinition()
 * }
 * ```
 */
export interface Constructable<T = any> extends Function {
    new (...args: any[]): T;
}

/**
 * Generic types for abstract class definitions.
 */
export type AbstractConstructable<T = any> = abstract new (...args: any[]) => T;
