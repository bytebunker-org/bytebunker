import type { DateTime } from 'luxon';
import type { Opt } from '@mikro-orm/core';
import { ApiProperty } from '@nestjs/swagger';

export class TimestampDto {
    @ApiProperty({
        type: 'string',
        format: 'date-time',
    })
    public createdAt!: DateTime & Opt;

    @ApiProperty({
        type: 'string',
        format: 'date-time',
    })
    public updatedAt!: DateTime & Opt;
}
