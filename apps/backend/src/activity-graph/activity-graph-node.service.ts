import { type ASObject, createUnknownASType } from '@bytebunker/event-schema';
import { Injectable } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import { ExtensionEntity } from '../extension/entity/extension.entity.js';
import type { LocalExtensionId } from '../extension/extensions/local-extension.constant.js';

@Injectable()
export class ActivityGraphNodeService {
    public async getExtension(em: EntityManager, id: string): Promise<ASObject> {
        const extension = await em.findOneOrFail(ExtensionEntity, id as LocalExtensionId);

        return {
            '@id': `extension/${id}`,
            '@type': createUnknownASType('Extension'),
            name: extension.name,
        } satisfies ASObject;
    }
}
