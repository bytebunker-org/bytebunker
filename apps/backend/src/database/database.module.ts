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
        // Accessing `pg.native` lazily loads pg-native/libpq. If the native addon was not compiled
        // (e.g. the build script was skipped), the getter throws instead of returning null - which
        // must not crash bootstrap. MikroORM works fine on the JS bindings either way.
        let nativeAvailable = false;
        try {
            nativeAvailable = Boolean((pg as typeof pg & { native?: unknown }).native);
        } catch {
            nativeAvailable = false;
        }

        if (nativeAvailable) {
            this.logger.log('Using native pg bindings for database connection');
        } else {
            this.logger.warn('Native pg bindings unavailable - falling back to JavaScript bindings');
        }
    }
}
