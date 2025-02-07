import { Injectable } from '@nestjs/common';
import { type SessionData, Store } from 'express-session';
import { EntityManager } from '@mikro-orm/postgresql';
import { StoredUserSessionEntity } from './entity/stored-user-session.entity.js';
import { DateTime } from 'luxon';
import { SessionConfig } from '../util/config/session.config.js';
import { UserEntity } from '../user/entity/user.entity.js';
import { buildQueryCacheKey, cacheQuery } from '../database/util/query-cache.util.js';

@Injectable()
export class MikroOrmSessionStoreService extends Store {
    constructor(
        private readonly em: EntityManager,
        private readonly sessionConfig: SessionConfig,
    ) {
        super();
    }

    public override async get(
        sessionId: string,
        callback: (error: unknown | undefined, session?: SessionData | null | undefined) => void,
    ): Promise<void> {
        try {
            const em = this.em.fork({ useContext: true, disableTransactions: true });

            const session = await em.findOne(
                StoredUserSessionEntity,
                { sessionId, expiresAt: { $gt: DateTime.now() } },
                { cache: cacheQuery(StoredUserSessionEntity, sessionId, 1000 * 60) },
            );

            callback?.(null, session?.data);
        } catch (error) {
            callback(error);
        }
    }

    public override async set(
        sessionId: string,
        session: SessionData,
        callback?: (error?: unknown) => void,
    ): Promise<void> {
        console.trace('set session', sessionId, session);
        try {
            const em = this.em.fork({ useContext: true, disableTransactions: true });

            await em.upsert(StoredUserSessionEntity, {
                sessionId,
                data: session,
                expiresAt: DateTime.now().plus({ millisecond: this.sessionConfig.cookieMaxAge }),
                user: session.passport?.user?.id ? em.getReference(UserEntity, session.passport?.user?.id) : undefined,
            });
            await em.flush();

            callback?.(null);
        } catch (error) {
            callback?.(error);
        }
    }

    public override async destroy(sessionId: string, callback?: (error?: unknown) => void): Promise<void> {
        try {
            const em = this.em.fork({ useContext: true, disableTransactions: true });
            console.log('destroy session', sessionId);
            await em.nativeDelete(StoredUserSessionEntity, {
                $or: [
                    {
                        sessionId,
                    },
                    {
                        expiresAt: {
                            $lte: DateTime.now(),
                        },
                    },
                ],
            });
            await em.clearCache(buildQueryCacheKey(StoredUserSessionEntity, sessionId));

            callback?.(null);
        } catch (error) {
            callback?.(error);
        }
    }
}
