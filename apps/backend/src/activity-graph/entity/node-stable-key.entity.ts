import { BaseEntity, Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
export class NodeStableKeyEntity extends BaseEntity {
    @PrimaryKey({
        type: 'string',
        length: 512,
    })
    public stableKey!: string;

    @Property({
        type: 'string',
    })
    public nodeId!: string;
}
