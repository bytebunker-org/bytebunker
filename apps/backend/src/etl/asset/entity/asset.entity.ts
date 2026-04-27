import { Entity, Enum, PrimaryKey, PrimaryKeyProp, Property, types, Unique } from '@mikro-orm/core';
import { AssetTypeEnum } from '../type/asset-type.enum.js';
import { toDatabaseEnumName } from '../../../database/util/database.util.js';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import type { CommonMetadata } from '../common-metadata.interface.js';
import type { AssetDto } from '../dto/asset.dto.js';

@Entity()
@Unique({
    properties: ['type', 'hash'],
})
export class AssetEntity extends TimestampEntity implements AssetDto {
    [PrimaryKeyProp]?: 'id';

    @PrimaryKey({
        type: types.uuid,
    })
    public id!: string;

    @Enum({
        items: () => AssetTypeEnum,
        nativeEnumName: toDatabaseEnumName('AssetTypeEnum'),
    })
    public type!: AssetTypeEnum;

    @Property({
        type: types.blob,
        length: 32,
    })
    public hash!: Buffer;

    @Property()
    public originalFilename!: string;

    @Property()
    public mimeType!: string;

    @Property({ nullable: true })
    public size?: number | null;

    @Property({ nullable: true })
    public storagePath?: string | null;

    @Property({ length: 2048, nullable: true })
    public externalUrl?: string | null;

    @Property({
        type: types.text,
        length: 512,
        nullable: true,
    })
    public textAssetPreview?: string;

    @Property({
        type: types.json,
    })
    public metadata!: CommonMetadata & Record<string, unknown>;

    @Property({ persist: false })
    public publicUrl?: string;
}
