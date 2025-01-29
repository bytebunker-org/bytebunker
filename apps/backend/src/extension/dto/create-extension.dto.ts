import { PickType } from '@nestjs/swagger';
import { ExtensionDto } from './extension.dto.js';
import { IsUUID } from 'class-validator';

export class CreateExtensionDto extends PickType(ExtensionDto, ['id', 'name'] as const) {
    @IsUUID()
    public developerId!: string;
}
