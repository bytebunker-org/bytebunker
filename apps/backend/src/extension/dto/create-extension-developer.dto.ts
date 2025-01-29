import { PickType } from '@nestjs/swagger';
import { ExtensionDeveloperDto } from './extension-developer.dto.js';

export class CreateExtensionDeveloperDto extends PickType(ExtensionDeveloperDto, ['id', 'name'] as const) {}
