import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { MikroOrmConfigService } from './mikro-orm-config.service.js';
import pg from 'pg';

@Module({
    providers: [MikroOrmConfigService],
    exports: [MikroOrmConfigService],
})
export class DatabaseModule implements OnModuleInit {
    private readonly logger = new Logger(DatabaseModule.name);

    public onModuleInit(): void {
        if (pg.native) {
            this.logger.log('Using native pg bindings for database connection');
        } else {
            this.logger.warn(`Cannot use native pg bindings for database connection - is pg-native installed?`);
        }
    }
}
