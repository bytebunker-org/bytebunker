import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service.js';
import { UserModule } from '../user/user.module.js';

@Module({
    imports: [UserModule],
    providers: [ActivityService],
    exports: [ActivityService],
})
export class ActivityModule {}
