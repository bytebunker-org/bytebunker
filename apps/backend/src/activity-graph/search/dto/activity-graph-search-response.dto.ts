import type { DateTime } from 'luxon';
import { IsDateTime } from '../../../util/custom-validator.util.js';
import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import type { ASActivity } from '@bytebunker/event-schema';

export class ActivityGraphSearchResponseDto {
    @IsArray()
    @IsObject({ each: true })
    @ValidateNested({ each: true })
    public activities!: ASActivity[];

    @IsString()
    @IsIn(['startCursor', 'endCursor'])
    public cursorType!: 'startCursor' | 'endCursor';

    @IsOptional()
    @IsDateTime()
    public previousPageEndCursor?: DateTime;

    @IsOptional()
    @IsDateTime()
    public currentPageCursor!: DateTime;

    @IsOptional()
    @IsDateTime()
    public nextPageStartCursor?: DateTime;

    @IsBoolean()
    public hasPreviousPage!: boolean;

    @IsBoolean()
    public hasNextPage!: boolean;
}
