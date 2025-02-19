import { Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ActivityGraphService } from './activity-graph.service.js';
import { EntityManager } from '@mikro-orm/postgresql';
import { UserEntity } from '../user/entity/user.entity.js';
import { UserModule } from '../user/user.module.js';
import { GraphDatabaseModule } from './graph-database/graph-database.module.js';

@Module({
    imports: [UserModule, GraphDatabaseModule],
    providers: [ActivityGraphService],
    exports: [ActivityGraphService],
})
export class ActivityGraphModule implements OnApplicationBootstrap {
    private readonly logger = new Logger(ActivityGraphModule.name);

    constructor(
        private readonly em: EntityManager,
        private readonly activityGraphService: ActivityGraphService,
    ) {}

    public onApplicationBootstrap(): Promise<void> {
        return this.em.transactional(async (em) => {
            const users = await this.em.find(UserEntity, { deletedAt: null });

            for (const user of users) {
                const userNode = await this.activityGraphService.createUserPersonNode(em, user);

                this.logger.log(`Created node for user ${userNode.get('id')}`);
            }
        });
    }
}
