export type RestApiFindOperatorType =
    | 'not'
    | 'lessThan'
    | 'lessThanOrEqual'
    | 'moreThan'
    | 'moreThanOrEqual'
    | 'equal'
    | 'between'
    | 'in'
    | 'any'
    | 'isNull'
    | 'ilike'
    | 'like'
    | 'raw'
    | 'arrayContains'
    | 'arrayContainedBy'
    | 'arrayOverlap'
    | 'and'
    | 'jsonContains';

export interface RestApiFindOperator<T> {
    type: RestApiFindOperatorType;

    value: T;
}
