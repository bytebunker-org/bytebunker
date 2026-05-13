import type { Logger } from '@nestjs/common';
import { parse } from 'node-html-parser';
import { type YouTubeWatchEntry, YouTubeProductEnum } from '@bytebunker/event-schema/extension/youtube';
import { parseGermanTimestamp } from './youtube-date.util.js';

const VIDEO_ID_PATTERN = /[?&]v=([^&]+)/;
const CHANNEL_ID_PATTERN = /\/channel\/([^/?#]+)/;

/**
 * Parses Google Takeout `Wiedergabeverlauf.html` (YouTube watch history). Each row is an
 * `.outer-cell` div containing a header (`YouTube` vs `YouTube Music`), the watched video link,
 * the channel link, and a German-formatted timestamp.
 */
export function parseYouTubeWatchHistory(html: string, logger?: Logger): YouTubeWatchEntry[] {
    const root = parse(html);
    const cells = root.querySelectorAll('.outer-cell');

    const entries: YouTubeWatchEntry[] = [];
    let skipped = 0;

    for (const cell of cells) {
        const headerText = cell.querySelector('.header-cell .mdl-typography--title')?.text?.trim();
        const product = mapProduct(headerText);

        if (!product) {
            skipped++;
            continue;
        }

        const bodyCell = cell
            .querySelectorAll('.content-cell.mdl-typography--body-1')
            .find((el) => !el.classList.contains('mdl-typography--text-right'));

        if (!bodyCell) {
            skipped++;
            continue;
        }

        const links = bodyCell.querySelectorAll('a');
        const videoLink = links[0];
        const videoUrl = videoLink?.getAttribute('href');
        const videoId = videoUrl ? extractVideoId(videoUrl) : undefined;

        if (!videoLink || !videoUrl || !videoId) {
            skipped++;
            continue;
        }

        const channelLink = links[1];
        const channelUrl = channelLink?.getAttribute('href');
        const channelName = channelLink?.text?.trim();
        const channelId = channelUrl ? extractChannelId(channelUrl) : undefined;

        // Last text node in the body cell is the timestamp.
        const timestampText = bodyCell.childNodes
            .filter((n) => n.nodeType === 3)
            .map((n) => n.text.trim())
            .filter(Boolean)
            .pop();

        const watchedAt = timestampText ? parseGermanTimestamp(timestampText) : undefined;

        if (!watchedAt) {
            skipped++;
            continue;
        }

        entries.push({
            product,
            videoId,
            videoUrl,
            title: videoLink.text.trim(),
            ...(channelName ? { channelName } : {}),
            ...(channelId ? { channelId } : {}),
            ...(channelUrl ? { channelUrl } : {}),
            watchedAt: watchedAt.toISO()!,
        });
    }

    if (skipped > 0) {
        logger?.warn(`Skipped ${skipped} of ${cells.length} YouTube watch history entries (missing fields)`);
    }

    return entries;
}

function mapProduct(headerText: string | undefined): YouTubeProductEnum | undefined {
    if (!headerText) {
        return undefined;
    }

    const normalized = headerText.replace(/\s+/g, ' ').trim();

    if (normalized === 'YouTube Music') {
        return YouTubeProductEnum.YOUTUBE_MUSIC;
    }

    if (normalized === 'YouTube') {
        return YouTubeProductEnum.YOUTUBE;
    }

    return undefined;
}

function extractVideoId(url: string): string | undefined {
    return VIDEO_ID_PATTERN.exec(url)?.[1];
}

function extractChannelId(url: string): string | undefined {
    return CHANNEL_ID_PATTERN.exec(url)?.[1];
}
