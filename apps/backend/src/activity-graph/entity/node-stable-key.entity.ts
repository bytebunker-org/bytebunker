import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
export class NodeStableKeyEntity {
    @PrimaryKey({
        type: 'string',
    })
    public stableKey!: string;

    @Property({
        type: 'string',
    })
    public nodeId!: string;
}
