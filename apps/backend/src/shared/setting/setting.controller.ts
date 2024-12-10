import { Body, Controller, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import { SettingService } from './setting.service.js';
import { SettingCategoryDto } from './dto/setting-category.dto.js';
import { SettingValueDto } from './dto/setting-value.dto.js';
import { SettingCategoryEntity } from './entity/setting-category.entity.js';
import { ApiTags } from '@nestjs/swagger';
import type {
    GetSettingsReturnType,
    GetSettingValuesReturnType,
    GlobalSettingValues,
} from './type/setting-service-util.type.js';
import { getGlobalSettings } from './global-setting.constant.js';
import type { UserDto } from '../../user/dto/user.dto.js';
import { CurrentUser } from '../../user/decorator/user.decorator.js';
import type { ByteBunkerSettingKeys } from '../../util/setting/setting.constant.js';

@Controller('settings')
@ApiTags('setting')
export class SettingController {
    constructor(
        private readonly settingService: SettingService,
        @InjectRepository(SettingCategoryEntity)
        private readonly settingCategoryEntityRepository: Repository<SettingCategoryEntity>,
        private readonly dataSource: DataSource,
    ) {}

    @Get('/values')
    public listValues(
        @CurrentUser() user: UserDto,
        @Query('keys') keys: string,
    ): Promise<GetSettingValuesReturnType<ByteBunkerSettingKeys>> {
        return this.dataSource.transaction((em) =>
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
        return this.settingCategoryEntityRepository.findOneOrFail({
            where: { key: categoryKey },
            relations: {
                subCategories: true,
                parentCategory: {
                    subCategories: true,
                },
            },
        });
    }

    @Get('/categories')
    public listMenuCategories(): Promise<SettingCategoryDto[]> {
        return [];
        /*return this.settingCategoryEntityRepository.find({
            select: ['key', 'icon', 'subCategories'],
            relations: ['subCategories'],
            where: {
                parentCategoryKey: IsNull(),
                hidden: false,
            },
        });*/
    }

    @Get('/')
    public list(
        @CurrentUser() user: UserDto,
        @Query('categoryKey') categoryKey: string,
    ): Promise<GetSettingsReturnType> {
        return this.settingService.getSettings(categoryKey, user.id);
    }

    @Put('/')
    @HttpCode(204)
    public store(
        @CurrentUser() user: UserDto,
        @Body() data: Pick<SettingValueDto, 'settingKey' | 'value'>[],
    ): Promise<void> {
        return this.dataSource.transaction((em) => this.settingService.storeSettings(em, data, user.id));
    }
}
