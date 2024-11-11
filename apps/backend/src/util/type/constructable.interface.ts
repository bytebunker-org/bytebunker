/**
 * Generic types for class definitions.
 * Example usage:
 * ```
 * function createSomeInstance(myClassDefinition: Constructable<MyClass>) {
 *   return new myClassDefinition()
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export interface Constructable<T = any> extends Function {
    new (...args: any[]): T;
}
