import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { SerializedUserDto } from './dto/serialized-user.dto.js';
import { UserService } from '../user/user.service.js';
import { BcryptService } from '../shared/hashing/bcrypt.service.js';
import type { EntityManager } from '@mikro-orm/postgresql';

@Injectable()
export class LocalAuthenticationService {
    private readonly logger = new Logger(LocalAuthenticationService.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly userService: UserService,
        private readonly bcryptService: BcryptService,
    ) {}

    public async loginUser(em: EntityManager, username: string, password: string): Promise<SerializedUserDto> {
        const user = await this.userService.findByUsernameForAuthentication(em, username);

        if (!user) {
            throw new UnauthorizedException("User doesn't exist");
        }

        const isPasswordValid = await this.bcryptService.compare(password, user.password!);

        if (!isPasswordValid) {
            throw new UnauthorizedException('Password not valid');
        }

        return user;
    }
}
