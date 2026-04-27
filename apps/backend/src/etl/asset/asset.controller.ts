import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EntityManager } from '@mikro-orm/postgresql';
import { AssetService } from './asset.service.js';
import { AssetTypeEnum } from './type/asset-type.enum.js';
import { UploadAssetDto } from './dto/upload-asset.dto.js';
import { AssetDto } from './dto/asset.dto.js';
import { BadRequestError } from '../../util/rest-error.js';

@ApiTags('assets')
@Controller('assets')
export class AssetController {
    constructor(
        private readonly em: EntityManager,
        private readonly assetService: AssetService,
    ) {}

    @Post()
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Upload an asset' })
    @ApiResponse({ status: 201, type: AssetDto })
    public upload(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadAssetDto): Promise<AssetDto> {
        if (!file) {
            throw new BadRequestError('Missing file in upload request');
        }

        const userMetadata = dto.metadata ? this.parseMetadata(dto.metadata) : undefined;

        return this.em.transactional((em) =>
            this.assetService.storeAsset(em, file.buffer, {
                type: dto.type ?? AssetTypeEnum.PRIMARY,
                originalFilePath: file.originalname,
                size: file.size,
                metadata: {
                    ...userMetadata,
                    'Content-Type': file.mimetype,
                },
            }),
        );
    }

    @Get(':id/info')
    @ApiOperation({ summary: 'Get asset metadata' })
    @ApiResponse({ status: 200, type: AssetDto })
    public info(@Param('id', ParseUUIDPipe) id: string): Promise<AssetDto> {
        return this.assetService.findById(this.em, id);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete an asset' })
    @ApiResponse({ status: 204, description: 'Asset deleted' })
    public remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
        return this.em.transactional((em) => this.assetService.delete(em, id));
    }

    private parseMetadata(raw: string): Record<string, unknown> {
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                throw new Error('metadata must be a JSON object');
            }
            return parsed as Record<string, unknown>;
        } catch (error) {
            throw new BadRequestError(`Invalid metadata JSON: ${(error as Error).message}`);
        }
    }
}
