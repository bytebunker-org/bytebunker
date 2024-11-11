import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { AuthService } from '../auth.service.js';
import { Strategy } from 'passport-local';
import type { UserSessionDto } from '../../user/dto/user-session.dto.js';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local-admin') {
    constructor(private readonly authService: AuthService) {
        super();
    }

    validate(username: string, password: string): Promise<UserSessionDto> {
        //        return this.authService.validateUser({ username, password });
        return undefined as any;
    }
}
