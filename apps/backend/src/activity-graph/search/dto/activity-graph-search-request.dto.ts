import type { DateTime } from 'luxon';
import { IsDateTime } from '../../../util/custom-validator.util.js';
import { IsIn, IsOptional } from 'class-validator';
import { NodeLabelEnum } from '../../node-label.enum.js';
import { allActivityTypes } from '../../activity-graph.constant.js';
import { Transform } from 'class-transformer';
import { dateTimeClassTransformer } from '../../../util/datetime-class-transformer.util.js';

export class ActivityGraphSearchRequestDto {
    @IsOptional()
    @IsDateTime()
    @Transform(dateTimeClassTransformer)
    public cursorStart?: DateTime;

    @IsOptional()
    @IsDateTime()
    @Transform(dateTimeClassTransformer)
    public cursorEnd?: DateTime;

    @IsOptional()
    @IsIn(allActivityTypes)
    public activityTypes?: NodeLabelEnum[];
}
