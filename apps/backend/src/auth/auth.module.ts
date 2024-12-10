import { Module } from '@nestjs/common';
import { LocalAuthenticationService } from './local-authentication.service.js';
import { AuthController } from './auth.controller.js';
import { LocalStrategy } from './local.strategy.js';
import { PassportModule } from '@nestjs/passport';
import { AuthSerializationProvider } from './auth-serialization.provider.js';
import { LocalLoginGuard } from './local-login.guard.js';
import { UserModule } from '../user/user.module.js';

@Module({
    imports: [
        PassportModule.register({
            session: true,
        }),
        UserModule,
    ],
    controllers: [AuthController],
    providers: [LocalAuthenticationService, LocalStrategy, AuthSerializationProvider, LocalLoginGuard],
})
export class AuthModule {}
