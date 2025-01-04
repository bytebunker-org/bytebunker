import { Body, Controller, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import { SettingService } from './setting.service.js';
import { SettingCategoryDto } from './dto/setting-category.dto.js';
import { SettingValueDto } from './dto/setting-value.dto.js';
import { ApiTags } from '@nestjs/swagger';
import type {
    GetSettingsReturnType,
    GetSettingValuesReturnType,
    GlobalSettingValues,
} from './type/setting-service-util.type.js';
import { getGlobalSettings } from './global-setting.constant.js';
import type { UserDto } from '../../user/dto/user.dto.js';
import type { ByteBunkerSettingKeys } from '../../util/setting/setting.constant.js';
import { EntityManager } from '@mikro-orm/postgresql';
import { CurrentUser } from '../../auth/decorator/user.decorator.js';
import { SettingCategoryEntity } from './entity/setting-category.entity.js';

@Controller('settings')
@ApiTags('setting')
export class SettingController {
    constructor(
        private readonly settingService: SettingService,
        private readonly em: EntityManager,
    ) {}

    @Get('/values')
    public listValues(
        @CurrentUser() user: UserDto,
        @Query('keys') keys: string,
    ): Promise<GetSettingValuesReturnType<ByteBunkerSettingKeys>> {
        return this.em.transactional((em) =>
            this.settingService.getSettingValues(em, keys.split(',') as ByteBunkerSettingKeys[], user.id),
        );
    }

    @Get('/values/global')
    public listGlobalValues(): GlobalSettingValues {
        return getGlobalSettings();
    }

    @Get('/categories/:categoryKey')
    public getCategory(
        @CurrentUser() user: UserDto,
        @Param('categoryKey') categoryKey: string,
    ): Promise<SettingCategoryDto> {
        return this.em.findOneOrFail(
            SettingCategoryEntity,
            {
                key: categoryKey,
            },
            {
                populate: ['subCategories', 'parentCategory.subCategories'],
            },
        );
    }

    @Get('/categories')
    public listMenuCategories(): Promise<SettingCategoryDto[]> {
        return this.em.find(
            SettingCategoryEntity,
            {
                parentCategoryKey: null,
                hidden: false,
            },
            {
                populate: ['subCategories'],
            },
        );
    }

    @Get('/')
    public list(
        @CurrentUser() user: UserDto,
        @Query('categoryKey') categoryKey: string,
    ): Promise<GetSettingsReturnType> {
        return this.em.transactional((em) => this.settingService.getSettings(em, categoryKey, user.id));
    }

    @Put('/')
    @HttpCode(204)
    public store(
        @CurrentUser() user: UserDto,
        @Body() data: Pick<SettingValueDto, 'settingKey' | 'value'>[],
    ): Promise<void> {
        return this.em.transactional((em) => this.settingService.storeSettings(em, data, user.id));
    }
}
