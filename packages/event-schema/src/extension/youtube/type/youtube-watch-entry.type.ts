export enum YouTubeProductEnum {
    YOUTUBE = 'YouTube',
    YOUTUBE_MUSIC = 'YouTubeMusic',
}

export interface YouTubeWatchEntry {
    product: YouTubeProductEnum;

    videoId: string;

    videoUrl: string;

    title: string;

    channelName?: string;

    channelId?: string;

    channelUrl?: string;

    /**
     * ISO 8601 with offset (Europe/Berlin), e.g. `2025-02-03T12:08:18.000+01:00`
     */
    watchedAt: string;
}
