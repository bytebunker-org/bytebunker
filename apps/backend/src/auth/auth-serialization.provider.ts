import { Inject, Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import type { SerializedUserDto } from './dto/serialized-user.dto.js';
import type { UserSessionDto } from '../user/dto/user-session.dto.js';
import type { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

@Injectable()
export class AuthSerializationProvider extends PassportSerializer {
    constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {
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
            let user = await this.cacheManager.get<SerializedUserDto>(`user:${payload.id}`);

            if (!user) {
                /*user = (await this.userRepository.findOneOrFail({
                    where: { id: payload.id },
                    relations: { linkedDevice: true },
                })) as UserDataType;

                await this.cacheManager.set(`user:${payload.id}`, user);*/
            }

            done(null, { ...user } as any);
        } catch (error) {
            done(error as Error);
        }
    }
}
