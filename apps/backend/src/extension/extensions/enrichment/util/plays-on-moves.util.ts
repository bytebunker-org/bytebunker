import { joinOverlappingIntervals, type TimeInterval } from './interval-join.util.js';

/** A Listen or View; `end === start` when the source only knows when playback started (YouTube). */
export interface Play extends TimeInterval {
    id: string;
    kind: 'listen' | 'view';
}

export interface PlayMove extends TimeInterval {
    id: string;
    mode: string;
}

export interface PlayMoveLink {
    playId: string;
    moveId: string;
    mode: string;
    kind: Play['kind'];
    overlapSeconds: number;
}

export interface PlaysPerMode {
    mode: string;
    listens: number;
    views: number;
    /** Overlap of the plays with moves of this mode. */
    minutes: number;
    /** Moves of this mode with at least one play. */
    movesWithPlays: number;
}

export interface PlaysOnMovesResult {
    links: PlayMoveLink[];
    perMode: PlaysPerMode[];
    linkedPlays: number;
}

/**
 * Links plays to the moves they happened during. A play with a duration needs to overlap the move by
 * `minOverlapSeconds`, or by half its own length if it is shorter (a skipped track inside the move still counts,
 * a song that ended just as the move started does not). A play without a duration counts if it started during the move.
 */
export function linkPlaysToMoves(
    plays: Play[],
    moves: PlayMove[],
    options: { minOverlapSeconds: number },
): PlaysOnMovesResult {
    const links: PlayMoveLink[] = [];
    const perMode = new Map<string, PlaysPerMode & { moveIds: Set<string> }>();
    const linkedPlayIds = new Set<string>();

    for (const { left: play, right: move, overlapMs } of joinOverlappingIntervals(plays, moves)) {
        const playMs = play.end - play.start;

        if (playMs > 0) {
            const requiredMs = Math.min(options.minOverlapSeconds * 1000, playMs / 2);

            if (overlapMs <= 0 || overlapMs < requiredMs) {
                continue;
            }
        } else if (play.start >= move.end && move.end > move.start) {
            // Started the moment the move ended: that belongs to whatever came next.
            continue;
        }

        links.push({
            playId: play.id,
            moveId: move.id,
            mode: move.mode,
            kind: play.kind,
            overlapSeconds: Math.round(overlapMs / 1000),
        });
        linkedPlayIds.add(play.id);

        const entry = perMode.get(move.mode) ?? {
            mode: move.mode,
            listens: 0,
            views: 0,
            minutes: 0,
            movesWithPlays: 0,
            moveIds: new Set<string>(),
        };

        entry[play.kind === 'listen' ? 'listens' : 'views']++;
        entry.minutes += overlapMs / 60_000;
        entry.moveIds.add(move.id);
        perMode.set(move.mode, entry);
    }

    return {
        links,
        linkedPlays: linkedPlayIds.size,
        perMode: [...perMode.values()]
            .map(({ moveIds, ...entry }) => ({
                ...entry,
                minutes: Math.round(entry.minutes),
                movesWithPlays: moveIds.size,
            }))
            .sort((a, b) => b.listens + b.views - (a.listens + a.views) || a.mode.localeCompare(b.mode)),
    };
}
