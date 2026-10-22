export enum RelationshipLabelEnum {
    ACTED_IN = 'ACTED_IN',
    GENERATED_BY = 'GENERATED_BY',
    FROM = 'FROM',
    TO = 'TO',
    INVOLVES = 'INVOLVES',
    /** Derived: raw place -> canonical place it was consolidated into. */
    SAME_AS = 'SAME_AS',
    /** Derived: owner person -> place they lived at during {from, to}. */
    HOME_DURING = 'HOME_DURING',
    /** Derived: owner person -> place they worked at during {from, to}. */
    WORK_DURING = 'WORK_DURING',
}
