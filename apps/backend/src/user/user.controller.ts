import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { UserService } from './user.service.js';
import { UserEntity } from './entity/user.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UserDto } from './dto/user.dto.js';
import type { UserSessionDto } from './dto/user-session.dto.js';
import { EntityManager } from '@mikro-orm/postgresql';
import { CurrentUser } from '../auth/decorator/user.decorator.js';
import { FindRestApiService } from '../shared/find-rest-api/find-rest-api.service.js';
import type { FindAllOptions } from '@mikro-orm/core';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
    ApiCountMethod,
    ApiFindAllMethod,
    ApiFindOneMethod,
} from '../shared/find-rest-api/find-rest-api-swagger.decorator.js';
import type { FindAllDto } from '../shared/find-rest-api/dto/find-all.dto.js';
import type { FindRestApiCountDto } from '../shared/find-rest-api/dto/find-rest-api-count.dto.js';
import type { FindRestApiCountResponseDto } from '../shared/find-rest-api/dto/find-rest-api-count-response.dto.js';
import type { FindOneDto } from '../shared/find-rest-api/dto/find-one.dto.js';

@Controller('users')
export class UserController {
    constructor(
        private readonly userService: UserService,
        private readonly findRestApiService: FindRestApiService,
        private readonly em: EntityManager,
    ) {}

    @Post()
    @ApiOperation({ summary: 'Create a new user' })
    @ApiResponse({ status: 201, type: UserDto })
    public async create(@Body() data: CreateUserDto): Promise<UserDto> {
        return this.em.transactional((em) => this.userService.create(em, data));
    }

    @Get('current')
    public getCurrentUser(@CurrentUser() user: UserSessionDto): UserSessionDto {
        return user;
    }

    @Get()
    @ApiFindAllMethod(UserDto)
    public findAll(@Query() query: FindAllDto<UserEntity>): Promise<UserDto[]> {
        return this.findRestApiService.findAll(UserEntity, query);
    }

    @Get('count')
    @ApiCountMethod(UserDto)
    public count(@Query() query: FindRestApiCountDto<UserEntity>): Promise<FindRestApiCountResponseDto> {
        return this.findRestApiService.count(UserEntity, query);
    }

    @Get(':id')
    @ApiFindOneMethod(UserDto)
    public findOne(@Param('id', ParseIntPipe) id: number, @Query() query: FindOneDto<UserEntity>): Promise<UserDto> {
        return this.findRestApiService.findOne(UserEntity, { id }, query);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a user' })
    @ApiResponse({ status: 204, description: 'User deleted' })
    public async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        await this.em.nativeDelete(UserEntity, { id });
    }
}
