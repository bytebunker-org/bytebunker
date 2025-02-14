import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UserEntity } from './entity/user.entity.js';
import { BcryptService } from '../shared/hashing/bcrypt.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import type { EntityManager } from '@mikro-orm/postgresql';
import { cacheQuery } from '../database/util/query-cache.util.js';

@Injectable()
export class UserService {
    private readonly logger = new Logger(UserService.name);

    private nullUser: UserEntity | null = null;
    private ownerUser: UserEntity | null = null;

    constructor(private readonly bcryptService: BcryptService) {}

    public async findByUsernameForAuthentication(em: EntityManager, username: string) {
        const user = await em.findOne(
            UserEntity,
            {
                username,
                deletedAt: null,
            },
            {
                populate: ['password'],
                cache: cacheQuery(UserEntity, [username, 'withPassword'], 1000 * 60),
            },
        );

        if (!user) {
            this.logger.warn(`User ${username} not found`);

            throw new NotFoundException(`User ${username} not found`);
        }

        return user;
    }

    public async create(em: EntityManager, userDto: CreateUserDto): Promise<UserEntity> {
        try {
            const existingUser = await em.findOne(UserEntity, {
                username: userDto.username,
            });

            if (existingUser) {
                throw new BadRequestException('Username is already taken');
            }

            return em.create(UserEntity, {
                username: userDto.username,
                password: await this.bcryptService.hash(userDto.password),
            });
        } catch (error) {
            if (!(error instanceof BadRequestException)) {
                throw new BadRequestException(error);
            } else {
                throw error;
            }
        }
    }

    public async getOwnerUser(em: EntityManager): Promise<UserEntity> {
        if (!this.ownerUser) {
            this.ownerUser = await em.findOneOrFail(UserEntity, {
                username: {
                    $ne: (await this.getNullUser(em)).username,
                },
            });
        }

        return this.ownerUser;
    }

    public async getNullUser(em: EntityManager): Promise<UserEntity> {
        if (!this.nullUser) {
            this.nullUser = await em.findOneOrFail(UserEntity, { username: 'null-user' });
        }

        return this.nullUser!;
    }
}
