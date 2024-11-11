import { TimestampDto } from '../../database/util/timestamp.dto.js';
import type { DateTime } from 'luxon';
import { tags } from 'typia';

export interface UserDto extends TimestampDto {
    id: number;

    username: string & tags.MinLength<1> & tags.MaxLength<32>;

    password?: string & tags.MinLength<1> & tags.MaxLength<60>;

    deletedAt?: DateTime;

    //userSettingValues?: SettingValueDto[];
}
