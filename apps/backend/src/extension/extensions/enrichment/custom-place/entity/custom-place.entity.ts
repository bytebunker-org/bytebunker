import { Entity, Enum, type Opt, PrimaryKey, PrimaryKeyProp, Property, types } from '@mikro-orm/core';
import { TimestampEntity } from '../../../../../database/util/timestamp.entity.js';
import { CUSTOM_PLACE_DEFAULT_RADIUS_METERS, type CustomPlaceDto } from '../dto/custom-place.dto.js';
import { CustomPlaceRoleEnum } from '../dto/custom-place-role.enum.js';

/** A user-defined place; see {@link CustomPlaceDto}. */
@Entity()
export class CustomPlaceEntity extends TimestampEntity implements CustomPlaceDto {
    [PrimaryKeyProp]?: 'id';

    @PrimaryKey()
    public id!: number;

    @Property({ length: 255 })
    public name!: string;

    @Property({ type: types.double })
    public latitude!: number;

    @Property({ type: types.double })
    public longitude!: number;

    @Property({ type: types.integer, default: CUSTOM_PLACE_DEFAULT_RADIUS_METERS })
    public radiusMeters: number & Opt = CUSTOM_PLACE_DEFAULT_RADIUS_METERS;

    @Enum({ items: () => CustomPlaceRoleEnum, default: CustomPlaceRoleEnum.OTHER })
    public role: CustomPlaceRoleEnum & Opt = CustomPlaceRoleEnum.OTHER;

    @Property({ type: types.date, nullable: true })
    public validFrom?: string | null;

    @Property({ type: types.date, nullable: true })
    public validTo?: string | null;

    @Property({ type: types.text, nullable: true })
    public notes?: string | null;
}
