import { UserDto } from './user.dto.js';
import { OmitType } from '@nestjs/swagger';

export class UserSessionDto extends OmitType(UserDto, ['password'] as const) {}
