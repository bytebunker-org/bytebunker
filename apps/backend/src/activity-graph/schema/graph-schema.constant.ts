import type { Neode } from '@bytebunker/neode';
import { RelationshipDirectionEnum } from '@bytebunker/neode';
import { PersonSchema } from './as-object/person.schema.js';
import { NodeLabelEnum } from '../node-label.enum.js';
import { ExtensionSchema } from './extension.schema.js';
import { ASActivitySchema } from './as-activity.schema.js';
import { ASObjectSchema } from './as-object.schema.js';
import { PlaceSchema } from './as-object/place.schema.js';
import { GooglePlaceSchema } from './as-object/google-place.schema.js';
import { GoogleTimelineActivitySchema } from './activity/google-timeline-activity.schema.js';
import { RelationshipLabelEnum } from '../relationship-label.enum.js';

export function registerGraphSchemas(neode: Neode): void {
    neode.model(NodeLabelEnum.EXTENSION, ExtensionSchema);

    neode.model(NodeLabelEnum.AS_OBJECT, ASObjectSchema);
    neode.extend(NodeLabelEnum.AS_OBJECT, NodeLabelEnum.PERSON, PersonSchema);
    neode.extend(NodeLabelEnum.AS_OBJECT, NodeLabelEnum.PLACE, PlaceSchema);
    neode.extend(NodeLabelEnum.PLACE, NodeLabelEnum.GOOGLE_PLACE, GooglePlaceSchema);

    neode.extend(NodeLabelEnum.AS_OBJECT, NodeLabelEnum.ACTIVITY, ASActivitySchema);
    neode.extend(NodeLabelEnum.ACTIVITY, NodeLabelEnum.GOOGLE_TIMELINE_ACTIVITY, GoogleTimelineActivitySchema);
    neode.extend(NodeLabelEnum.ACTIVITY, NodeLabelEnum.ACTIVITY_ARRIVE, {});
    neode.extend(NodeLabelEnum.ACTIVITY, NodeLabelEnum.ACTIVITY_MOVE, {});
}

export const relationshipInfoMap: Record<
    string,
    { type: RelationshipLabelEnum; direction: RelationshipDirectionEnum }
> = {
    generator: {
        type: RelationshipLabelEnum.GENERATED_BY,
        direction: RelationshipDirectionEnum.OUT,
    },
    actor: {
        type: RelationshipLabelEnum.ACTED_IN,
        direction: RelationshipDirectionEnum.IN,
    },
    origin: {
        type: RelationshipLabelEnum.FROM,
        direction: RelationshipDirectionEnum.OUT,
    },
    target: {
        type: RelationshipLabelEnum.TO,
        direction: RelationshipDirectionEnum.OUT,
    },
    location: {
        type: RelationshipLabelEnum.TO,
        direction: RelationshipDirectionEnum.OUT,
    },
};
