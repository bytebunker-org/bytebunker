import type { UserDto } from '../../user/dto/user.dto.js';

export interface SerializedUserDto extends Pick<UserDto, 'id'> {}
