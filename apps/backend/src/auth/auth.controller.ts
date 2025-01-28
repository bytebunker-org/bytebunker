import { Body, Controller, Get, Logger, Post, Req, Session, UseGuards } from '@nestjs/common';
import type { Request as RequestType } from 'express';
import { LoginDto } from './dto/login.dto.js';
import { CurrentUser } from './decorator/user.decorator.js';
import { LocalUserLoginGuard } from './local-user-login.guard.js';

import { ApiOperation } from '@nestjs/swagger';
import { Public } from './decorator/public.decorator.js';
import type { UserSessionDto } from '../user/dto/user-session.dto.js';

@Controller('auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);

    @Public()
    @UseGuards(LocalUserLoginGuard)
    @Post('login')
    @ApiOperation({
        summary: 'Login',
        description: 'Logs in a user and returns the session',
    })
    public login(@Body() _: LoginDto, @CurrentUser() user: UserSessionDto): UserSessionDto {
        return user;
    }

    @Get('session')
    @ApiOperation({
        summary: 'Get session',
        description: 'Gets the current session',
    })
    public getSession(
        @Req() request: RequestType,
        @Session() session: Record<string, any>,
        @CurrentUser() user: UserSessionDto,
    ): UserSessionDto {
        return user;
    }

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
