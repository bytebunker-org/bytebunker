import { UserDto } from './user.dto.js';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PickType } from '@nestjs/swagger';

export class CreateUserDto extends PickType(UserDto, ['username'] as const) {
    @IsString()
    @MinLength(12)
    @MaxLength(256)
    public password!: string;
}
