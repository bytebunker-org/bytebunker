import type { UserDto } from './user.dto.js';

export interface UserSessionDto extends Omit<UserDto, 'password'> {}
