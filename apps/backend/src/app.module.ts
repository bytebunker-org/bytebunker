import { Module } from '@nestjs/common';
import { ConfigModule } from './util/config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { MikroOrmConfigService } from './database/mikro-orm-config.service.js';
import { MikroOrmModule } from '@mikro-orm/nestjs';

@Module({
    imports: [
        ConfigModule,
        MikroOrmModule.forRootAsync({
            imports: [DatabaseModule],
            useExisting: MikroOrmConfigService,
        }),
    ],
})
export class AppModule {}
