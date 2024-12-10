import { PickType } from '@nestjs/swagger';
import { UserDto } from '../../user/dto/user.dto.js';

export class SerializedUserDto extends PickType(UserDto, ['id'] as const) {}
