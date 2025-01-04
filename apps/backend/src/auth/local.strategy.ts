import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { Injectable } from '@nestjs/common';
import { LocalAuthenticationService } from './local-authentication.service.js';
import type { SerializedUserDto } from './dto/serialized-user.dto.js';
import type { EntityManager } from '@mikro-orm/postgresql';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'yond-staff') {
    constructor(
        private authenticationService: LocalAuthenticationService,
        private readonly em: EntityManager,
    ) {
        super({ usernameField: 'email' });
    }

    public validate(email: string, password: string): Promise<SerializedUserDto> {
        return this.em.transactional((em) => this.authenticationService.loginUser(em, email, password));
    }
}
