import type { OnModuleInit } from '@nestjs/common';
import { Logger, Module } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entity/user.entity.js';
import { UserService } from './user.service.js';
import { UserController } from './user.controller.js';
import { HashingModule } from '../shared/hashing/hashing.module.js';
import { Repository } from 'typeorm';
import type { EntityProperties } from '../database/util/entity-properties.type.js';
import { UserRoleEnum } from './type/user-role.enum.js';
import { DateTime } from 'luxon';

@Module({
    imports: [TypeOrmModule.forFeature([UserEntity]), HashingModule],
    controllers: [UserController],
    providers: [UserService],
    exports: [UserService],
})
export class UserModule implements OnModuleInit {
    private readonly logger = new Logger(UserModule.name);

    constructor(@InjectRepository(UserEntity) private readonly userRepository: Repository<UserEntity>) {}

    public async onModuleInit(): Promise<void> {
        const nullUser = await this.userRepository.findOne({ where: { username: 'null-user' }, withDeleted: true });

        if (!nullUser) {
            await this.userRepository.save(
                new UserEntity({
                    username: 'null-user',
                    password: '',
                    role: UserRoleEnum.WORKER,
                    deletedAt: DateTime.now(),
                } as EntityProperties<UserEntity>),
            );

            this.logger.log('Created new internal null user');
        }
    }
}
