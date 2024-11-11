import type { DateTime } from 'luxon';

export class TimestampDto {
    public createdAt!: Date;

    public updatedAt!: Date;
}
