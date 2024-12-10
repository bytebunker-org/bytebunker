/**
 * Wrapper type for relation type definitions in dtos so typeorm doesn't have to be imported for this.
 * Used to circumvent ESM modules circular dependency issue caused by reflection metadata saving the type of the property.
 */
export type DtoRelation<T> = T;
