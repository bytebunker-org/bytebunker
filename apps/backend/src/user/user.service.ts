import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserEntity } from './entity/user.entity.js';
import { BcryptService } from '../shared/hashing/bcrypt.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import type { EntityManager } from '@mikro-orm/postgresql';

@Injectable()
export class UserService {
    private nullUser: UserEntity | null = null;

    constructor(private readonly bcryptService: BcryptService) {}

    public async findByUsernameForAuthentication(em: EntityManager, username: string): Promise<UserEntity> {
        const user = await em.findOne(
            UserEntity,
            {
                username,
            },
            {},
        );

        if (!user) {
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

            userDto.password = await this.bcryptService.hash(userDto.password);

            const newUser = new UserEntity(userDto);

            em.persist(newUser);

            return newUser;
        } catch (error) {
            throw new BadRequestException(error);
        }
    }

    public deleteUser(em: EntityManager, id: number): void {
        em.remove(em.getReference(UserEntity, id));
    }

    public async getNullUser(em: EntityManager): Promise<UserEntity> {
        if (!this.nullUser) {
            this.nullUser = await em.findOneOrFail(UserEntity, { username: 'null-user' });
        }

        return this.nullUser!;
    }
}
