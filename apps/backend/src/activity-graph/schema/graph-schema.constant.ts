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
import { SpotifyListenActivitySchema } from './activity/spotify-listen-activity.schema.js';
import { YouTubeViewActivitySchema } from './activity/youtube-view-activity.schema.js';
import { EventActivitySchema } from './activity/event-activity.schema.js';
import { AudioSchema } from './as-object/audio.schema.js';
import { MusicRecordingSchema } from './as-object/music-recording.schema.js';
import { PodcastEpisodeSchema } from './as-object/podcast-episode.schema.js';
import { VideoSchema } from './as-object/video.schema.js';
import { YouTubeVideoSchema } from './as-object/youtube-video.schema.js';

export function registerGraphSchemas(neode: Neode): void {
    neode.model(NodeLabelEnum.EXTENSION, ExtensionSchema);

    neode.model(NodeLabelEnum.AS_OBJECT, ASObjectSchema);
    neode.extend(NodeLabelEnum.AS_OBJECT, NodeLabelEnum.PERSON, PersonSchema);
    neode.extend(NodeLabelEnum.AS_OBJECT, NodeLabelEnum.PLACE, PlaceSchema);
    neode.extend(NodeLabelEnum.PLACE, NodeLabelEnum.GOOGLE_PLACE, GooglePlaceSchema);
    neode.extend(NodeLabelEnum.AS_OBJECT, NodeLabelEnum.AUDIO, AudioSchema);
    neode.extend(NodeLabelEnum.AUDIO, NodeLabelEnum.MUSIC_RECORDING, MusicRecordingSchema);
    neode.extend(NodeLabelEnum.MUSIC_RECORDING, NodeLabelEnum.SPOTIFY_TRACK, {});
    neode.extend(NodeLabelEnum.AUDIO, NodeLabelEnum.PODCAST_EPISODE, PodcastEpisodeSchema);
    neode.extend(NodeLabelEnum.PODCAST_EPISODE, NodeLabelEnum.SPOTIFY_EPISODE, {});
    neode.extend(NodeLabelEnum.AS_OBJECT, NodeLabelEnum.VIDEO, VideoSchema);
    neode.extend(NodeLabelEnum.VIDEO, NodeLabelEnum.YOUTUBE_VIDEO, YouTubeVideoSchema);

    neode.extend(NodeLabelEnum.AS_OBJECT, NodeLabelEnum.ACTIVITY, ASActivitySchema);
    neode.extend(NodeLabelEnum.ACTIVITY, NodeLabelEnum.GOOGLE_TIMELINE_ACTIVITY, GoogleTimelineActivitySchema);
    neode.extend(NodeLabelEnum.ACTIVITY, NodeLabelEnum.SPOTIFY_LISTEN_ACTIVITY, SpotifyListenActivitySchema);
    neode.extend(NodeLabelEnum.ACTIVITY, NodeLabelEnum.ACTIVITY_ARRIVE, {});
    neode.extend(NodeLabelEnum.ACTIVITY, NodeLabelEnum.ACTIVITY_LISTEN, {});
    neode.extend(NodeLabelEnum.ACTIVITY, NodeLabelEnum.ACTIVITY_MOVE, {});
    neode.extend(NodeLabelEnum.ACTIVITY, NodeLabelEnum.ACTIVITY_VIEW, {});
    neode.extend(NodeLabelEnum.ACTIVITY_VIEW, NodeLabelEnum.YOUTUBE_VIEW_ACTIVITY, YouTubeViewActivitySchema);
    neode.extend(NodeLabelEnum.ACTIVITY, NodeLabelEnum.ACTIVITY_EVENT, EventActivitySchema);
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
    object: {
        type: RelationshipLabelEnum.INVOLVES,
        direction: RelationshipDirectionEnum.OUT,
    },
};
