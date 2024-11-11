import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
    constructor() {}

    /*@Public()
    @UseGuards(LocalGuard)
    @Post('login')
    public login(@Body() data: LoginDto, @CurrentUser() user: UserSessionDto): Promise<UserSessionDto> {
        return this.dataSource.transaction(async (em) => {
            const linkedDevice = await em.findOneByOrFail(DeviceEntity, { internalId: data.linkedDeviceId });

            await this.deviceService.linkDevice(em, data.linkedDeviceId, user.id);

            user.linkedDeviceId = data.linkedDeviceId;
            user.linkedDevice = linkedDevice;

            return user;
        });
    }

    @Public()
    @UseGuards(LocalWorkerGuard)
    @Post('login/worker')
    public loginWorker(@Body() data: LoginWorkerDto, @CurrentUser() user: UserSessionDto): Promise<UserSessionDto> {
        return this.dataSource.transaction(async (em) => {
            const linkedDevice = await em.findOneByOrFail(DeviceEntity, { internalId: data.linkedDeviceId });

            await this.deviceService.linkDevice(em, data.linkedDeviceId, user.id);

            user.linkedDeviceId = data.linkedDeviceId;
            user.linkedDevice = linkedDevice;

            return user;
        });
    }

    @Public()
    @Get('session')
    public getSession(@Req() request: RequestType, @Session() session: Record<string, any>): void {
        console.log(request.user);
        console.log(session);
    }

    @UseGuards(AuthGuard)
    @Post('logout')
    public logout(@Request() request: RequestType): Record<string, never> {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        request.session.destroy(() => {});
        return {};
    }*/
}
