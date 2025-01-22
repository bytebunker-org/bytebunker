import type { DateTime } from 'luxon';
import type { Opt } from '@mikro-orm/core';

export class TimestampDto {
    public createdAt!: DateTime & Opt;

    public updatedAt!: DateTime & Opt;
}
