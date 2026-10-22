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
    /** Derived: travel -> activity that happened during the trip. */
    INCLUDES = 'INCLUDES',
    /** Derived: listen/view -> move it overlapped (music on the move). */
    DURING = 'DURING',
    /** Derived: calendar event -> arrive that confirms the owner was there {confidence, method}. */
    CONFIRMED_BY = 'CONFIRMED_BY',
    /** Derived: daily summary -> activity of that day. */
    SUMMARIZES = 'SUMMARIZES',
}
