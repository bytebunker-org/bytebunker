import {
    Collection,
    Entity,
    ManyToOne,
    OneToMany,
    PrimaryKey,
    PrimaryKeyProp,
    Property,
    type Ref,
    types,
} from '@mikro-orm/core';
import { TimestampEntity } from '../../database/util/timestamp.entity.js';
import { PipelineModuleEntity } from '../../etl/pipeline/pipeline-module/entity/pipeline-module.entity.js';
import { EXTENSION_NAME_LENGTH } from '../extension.constant.js';
import { ExtensionDeveloperEntity } from './extension-developer.entity.js';
import type { ExtensionDto } from '../dto/extension.dto.js';

@Entity()
export class ExtensionEntity extends TimestampEntity implements ExtensionDto {
    [PrimaryKeyProp]?: 'id';

    @PrimaryKey({ type: types.uuid })
    public id!: string;

    @ManyToOne(() => ExtensionDeveloperEntity, {
        updateRule: 'cascade',
        deleteRule: 'cascade',
    })
    public developer!: Ref<ExtensionDeveloperEntity>;

    @Property({
        length: EXTENSION_NAME_LENGTH,
        unique: true,
    })
    public name!: string;

    @OneToMany(() => PipelineModuleEntity, (module) => module.extension)
    public modules = new Collection<PipelineModuleEntity>(this);
}
