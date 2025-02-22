import type { OnModuleInit } from '@nestjs/common';
import { Logger, Module } from '@nestjs/common';
import { UserEntity } from './entity/user.entity.js';
import { UserService } from './user.service.js';
import { UserController } from './user.controller.js';
import { HashingModule } from '../shared/hashing/hashing.module.js';
import { DateTime } from 'luxon';
import { EntityManager } from '@mikro-orm/postgresql';
import { NIL } from 'uuid';

@Module({
    imports: [HashingModule],
    controllers: [UserController],
    providers: [UserService],
    exports: [UserService],
})
export class UserModule implements OnModuleInit {
    private readonly logger = new Logger(UserModule.name);

    constructor(private readonly em: EntityManager) {}

    public onModuleInit(): Promise<void> {
        return this.em.transactional(async (em) => {
            const nullUser = await em.findOne(UserEntity, { username: 'null-user' });

            if (!nullUser) {
                await em.persistAndFlush(
                    em.create(UserEntity, {
                        id: NIL,
                        username: 'null-user',
                        password: '',
                        deletedAt: DateTime.now(),
                    }),
                );

                this.logger.log('Created new internal null user');
            }
        });
    }
}
