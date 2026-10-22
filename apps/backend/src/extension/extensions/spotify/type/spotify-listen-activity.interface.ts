/**
 * secondary type: SpotifyListenActivity (activity type Listen)
 */
export interface SpotifyListenActivityInterface {
    /** Which history file the play comes from: `Streaming_History_Audio_*` or `Streaming_History_Video_*`. */
    mediaType: SpotifyMediaType;
    msPlayed: number;
    platform?: string;
    /** ISO 3166 country code of the connection, `ZZ` if unknown. */
    connCountry?: string;
    reasonStart?: string;
    reasonEnd?: string;
    shuffle?: boolean;
    skipped?: boolean;
    offline?: boolean;
    /** ISO 8601 (UTC). */
    offlineTimestamp?: string;
    incognitoMode?: boolean;
}

export type SpotifyMediaType = 'audio' | 'video';
