import type { DateTime } from 'luxon';

export class TimestampDto {
    public createdAt!: DateTime;

    public updatedAt!: DateTime;
}
