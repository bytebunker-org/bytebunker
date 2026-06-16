import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import { DateTime } from 'luxon';
import { UserService } from '../user/user.service.js';
import type { Node } from '@bytebunker/neode';
import { Neode } from '@bytebunker/neode';
import { NEODE_PROVIDER } from './graph-database/neode.constant.js';
import { NodeLabelEnum } from './node-label.enum.js';
import type { PersonNodeType } from './schema/as-object/person.schema.js';
import type { ExtensionNodeType } from './schema/extension.schema.js';
import { CORE_EXTENSION_ID, CORE_EXTENSION_NAME } from '../extension/extension.constant.js';
import type { UserEntity } from '../user/entity/user.entity.js';

@Injectable()
export class ActivityGraphService {
    private ownerActorNode?: Node<PersonNodeType>;

    constructor(
        private readonly userService: UserService,
        @Inject(NEODE_PROVIDER) private readonly neode: Neode,
    ) {}

    public async createUserPersonNode(em: EntityManager, user: UserEntity): Promise<Node<PersonNodeType>> {
        const [userNode, extension] = await Promise.all([
            this.neode.merge<PersonNodeType>(NodeLabelEnum.PERSON, {
                id: String(user.id),
                name: user.username,
            }),
            this.neode.merge<ExtensionNodeType>(NodeLabelEnum.EXTENSION, {
                id: CORE_EXTENSION_ID,
                name: CORE_EXTENSION_NAME,
            }),
        ]);
        await userNode.relateTo(extension, 'generator');

        return userNode;
    }

    public async getOwnerActor(em: EntityManager): Promise<Node<PersonNodeType>> {
        if (!this.ownerActorNode) {
            const ownerUser = await this.userService.getOwnerUser(em);

            this.ownerActorNode = await this.createUserPersonNode(em, ownerUser);
        }

        return this.ownerActorNode;
    }

    /**
     * Returns the start time of the most recently stored activity carrying any of the given type labels
     * (e.g. `Move`/`Arrive`), or `undefined` if none exist yet. `startTime` is persisted as an ISO-8601
     * UTC string, so a lexicographic `max()` is also the chronological maximum.
     */
    public async getLatestActivityStartTime(activityTypes: NodeLabelEnum[]): Promise<DateTime | undefined> {
        const result = await this.neode.readCypher<{ latestStartTime: string | null }>(
            `MATCH (activity:${NodeLabelEnum.ACTIVITY})
             WHERE any(label IN labels(activity) WHERE label IN $activityTypes)
             RETURN max(activity.startTime) AS latestStartTime`,
            { activityTypes },
        );

        const latestStartTime = result.records[0]?.get('latestStartTime');

        if (!latestStartTime) {
            return undefined;
        }

        const parsed = DateTime.fromISO(latestStartTime, { zone: 'utc' });

        return parsed.isValid ? parsed : undefined;
    }
}
