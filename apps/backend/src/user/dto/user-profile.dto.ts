import type { UserDto } from './user.dto.js';

export interface UserProfileDto extends Omit<UserDto, 'password'> {}
