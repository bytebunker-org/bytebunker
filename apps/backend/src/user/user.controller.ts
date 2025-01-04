import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { UserService } from './user.service.js';
import { UserEntity } from './entity/user.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UserDto } from './dto/user.dto.js';
import { ApiTags } from '@nestjs/swagger';
import type { UserSessionDto } from './dto/user-session.dto.js';
import { EntityManager } from '@mikro-orm/postgresql';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/decorator/user.decorator.js';
import { FindRestApiService } from '../shared/find-rest-api/find-rest-api.service.js';
import type { FindAllOptions } from '@mikro-orm/core';

@UseGuards(AuthGuard)
@Controller('users')
@ApiTags('auth')
export class UserController {
    constructor(
        private readonly userService: UserService,
        private readonly findRestApiService: FindRestApiService,
        private readonly em: EntityManager,
    ) {}

    @Post()
    public create(@Body() data: CreateUserDto): Promise<UserDto> {
        return this.em.transactional((em) => this.userService.create(em, data));
    }

    @Get()
    public findAll(@Query() data: FindAllOptions<UserEntity>): Promise<UserDto[]> {
        return this.findRestApiService.findMany(UserEntity, data);
    }

    @Get('current')
    public getCurrentUser(@CurrentUser() user: UserSessionDto): UserSessionDto {
        return user;
    }

    @Get(':id')
    public findOne(@Param('id', ParseIntPipe) id: number): Promise<UserDto> {
        return this.em.findOneOrFail(UserEntity, { id });
    }

    @Delete(':id')
    @HttpCode(204)
    public remove(@Param('id', ParseIntPipe) userId: number): Promise<void> {
        return this.em.transactional((em) => this.userService.deleteUser(em, userId));
    }
}
