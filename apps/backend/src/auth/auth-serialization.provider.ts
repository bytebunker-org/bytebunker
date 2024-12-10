import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import type { SerializedUserDto } from './dto/serialized-user.dto.js';
import type { UserSessionDto } from '../user/dto/user-session.dto.js';
import { UserEntity } from '../user/entity/user.entity.js';
import { EntityManager } from '@mikro-orm/postgresql';

@Injectable()
export class AuthSerializationProvider extends PassportSerializer {
    constructor(private readonly em: EntityManager) {
        super();
    }

    serializeUser(user: UserSessionDto, done: (error: Error | null, user?: SerializedUserDto) => void): void {
        done(null, { id: user.id });
    }

    async deserializeUser(
        payload: SerializedUserDto,
        done: (error: Error | null, user?: UserSessionDto) => void,
    ): Promise<void> {
        try {
            const user = await this.em.findOneOrFail(UserEntity, { id: payload.id });

            done(null, user);
        } catch (error) {
            done(error as Error);
        }
    }
}
