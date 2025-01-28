import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { Injectable } from '@nestjs/common';
import { LocalAuthenticationService } from './local-authentication.service.js';
import type { SerializedUserDto } from './dto/serialized-user.dto.js';
import { EntityManager } from '@mikro-orm/postgresql';

@Injectable()
export class LocalUserStrategy extends PassportStrategy(Strategy, 'local-user') {
    constructor(
        private authenticationService: LocalAuthenticationService,
        private readonly em: EntityManager,
    ) {
        super();
    }

    public validate(username: string, password: string): Promise<SerializedUserDto> {
        return this.em.transactional((em) => this.authenticationService.loginUser(em, username, password));
    }
}
