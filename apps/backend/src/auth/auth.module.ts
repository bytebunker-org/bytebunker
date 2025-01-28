import { Module } from '@nestjs/common';
import { LocalAuthenticationService } from './local-authentication.service.js';
import { AuthController } from './auth.controller.js';
import { LocalUserStrategy } from './local-user.strategy.js';
import { PassportModule } from '@nestjs/passport';
import { AuthSerializationProvider } from './auth-serialization.provider.js';
import { LocalUserLoginGuard } from './local-user-login.guard.js';
import { UserModule } from '../user/user.module.js';
import { HashingModule } from '../shared/hashing/hashing.module.js';

@Module({
    imports: [
        PassportModule.register({
            session: true,
        }),
        UserModule,
        HashingModule,
    ],
    controllers: [AuthController],
    providers: [LocalAuthenticationService, LocalUserStrategy, AuthSerializationProvider, LocalUserLoginGuard],
})
export class AuthModule {}
