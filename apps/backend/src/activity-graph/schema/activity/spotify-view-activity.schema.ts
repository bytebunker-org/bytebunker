import type { ASActivityNodeType } from '../as-activity.schema.js';
import type { InferGraphEntityType } from '@bytebunker/neode/types';
import { SpotifyPlaybackSchema } from './spotify-listen-activity.schema.js';

export const SpotifyViewActivitySchema = SpotifyPlaybackSchema;

export type SpotifyViewActivityNodeType = InferGraphEntityType<typeof SpotifyViewActivitySchema> & ASActivityNodeType;
