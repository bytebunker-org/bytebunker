import { Module } from '@nestjs/common';
import { EventService } from './event.service.js';
import { UserModule } from '../user/user.module.js';

@Module({
    imports: [UserModule],
    providers: [EventService],
    exports: [EventService],
})
export class EventModule {}
