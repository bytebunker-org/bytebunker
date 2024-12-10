import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { Injectable } from '@nestjs/common';
import { LocalAuthenticationService } from './local-authentication.service.js';
import type { SerializedUserDto } from './dto/serialized-user.dto.js';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'yond-staff') {
    constructor(private yondAuthenticationService: LocalAuthenticationService) {
        super({ usernameField: 'email' });
    }

    public validate(email: string, password: string): Promise<SerializedUserDto> {
        return this.yondAuthenticationService.loginAdmin(email, password);
    }
}
