import { UserDto } from './user.dto.js';
import { OmitType } from '@nestjs/swagger';

export class UserProfileDto extends OmitType(UserDto, ['password' as const]) {}
