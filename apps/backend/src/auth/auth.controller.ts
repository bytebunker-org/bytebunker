import { Body, Controller, Get, Logger, Post, Req, Session, UseGuards } from '@nestjs/common';
import type { Request as RequestType } from 'express';
import { LoginDto } from './dto/login.dto.js';
import { SerializedUserDto } from './dto/serialized-user.dto.js';
import { CurrentUser } from './decorator/user.decorator.js';
import { LocalGuard } from './local.guard.js';
import { LocalLoginGuard } from './local-login.guard.js';

import { ApiOperation, ApiTags } from '@nestjs/swagger';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);

    @UseGuards(LocalLoginGuard)
    @Post('login')
    @ApiOperation({
        summary: 'Login',
        description: 'Logs in a user and returns the session',
    })
    public login(@Body() _: LoginDto, @CurrentUser() user: SerializedUserDto): SerializedUserDto {
        return user;
    }

    @UseGuards(LocalGuard)
    @Get('session')
    @ApiOperation({
        summary: 'Get session',
        description: 'Gets the current session',
    })
    public getSession(
        @Req() request: RequestType,
        @Session() session: Record<string, any>,
        @CurrentUser() user: SerializedUserDto,
    ): SerializedUserDto {
        return user;
    }

    @UseGuards(LocalGuard)
    @Post('logout')
    @ApiOperation({
        summary: 'Logout',
        description: 'Logs out the current user',
    })
    public logout(@Req() request: RequestType): Record<string, never> {
        request.session.destroy(() => {});

        return {};
    }
}
