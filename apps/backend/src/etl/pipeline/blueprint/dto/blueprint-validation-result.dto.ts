export class BlueprintValidationIssueDto {
    public severity!: 'error' | 'warning';

    /** Stable machine-readable code, e.g. "unknown-module", "missing-input", "type-mismatch". */
    public code!: string;

    public message!: string;

    public nodeId?: number;

    public edgeId?: number;
}

export class BlueprintValidationResultDto {
    /** No errors (warnings allowed). */
    public valid!: boolean;

    public issues!: BlueprintValidationIssueDto[];
}
