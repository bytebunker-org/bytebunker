import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import type { SerializedUserDto } from './dto/serialized-user.dto.js';
import type { UserSessionDto } from '../user/dto/user-session.dto.js';
import { UserEntity } from '../user/entity/user.entity.js';
import { EntityManager } from '@mikro-orm/postgresql';
import { cacheQuery } from '../database/util/query-cache.util.js';

@Injectable()
export class AuthSerializationProvider extends PassportSerializer {
    constructor(private readonly em: EntityManager) {
        super();
    }

    public serializeUser(user: UserSessionDto, done: (error: Error | null, user?: SerializedUserDto) => void): void {
        done(null, { id: user.id });
    }

    public async deserializeUser(
        payload: SerializedUserDto,
        done: (error: Error | null, user?: UserSessionDto) => void,
    ): Promise<void> {
        try {
            const em = this.em.fork({ useContext: true, disableTransactions: true });

            const user = await em.findOneOrFail(
                UserEntity,
                { id: payload.id },
                {
                    cache: cacheQuery(UserEntity, [payload.id], 1000 * 60),
                },
            );

            done(null, user);
        } catch (error) {
            done(error as Error);
        }
    }
}
