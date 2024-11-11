import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service.js';
import { HashingModule } from '../shared/hashing/hashing.module.js';
import { AuthSerializationProvider } from './auth-serialization.provider.js';
import { LocalStrategy } from './strategies/local.strategy.js';
import { LocalGuard } from './guard/local.guard.js';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
    imports: [
        PassportModule.register({
            session: true,
        }),
        HashingModule,
        CacheModule.register({
            ttl: 1000 * 60,
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, LocalStrategy, LocalGuard, AuthSerializationProvider],
    exports: [AuthService],
})
export class AuthModule {}
