import type { UserDto } from './user.dto.js';
import { tags } from 'typia';

export interface CreateUserDto extends Pick<UserDto, 'username'> {
    password: string & tags.MinLength<12> & tags.MaxLength<256>;
}
