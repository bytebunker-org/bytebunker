import { OmitType } from '@nestjs/swagger';
import { ActivityGraphSearchRequestDto } from './activity-graph-search-request.dto.js';

export class ActivityGraphSearchCountRequestDto extends OmitType(ActivityGraphSearchRequestDto, [
    'cursorStart',
    'cursorEnd',
] as const) {}
