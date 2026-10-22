import { describe, expect, it } from 'vitest';
import { linkPlaysToMoves, type Play, type PlayMove } from './plays-on-moves.util.js';

const MIN = 60_000;
const play = (id: string, startMin: number, endMin: number = startMin, kind: Play['kind'] = 'listen'): Play => ({
    id,
    kind,
    start: startMin * MIN,
    end: endMin * MIN,
});
const move = (id: string, startMin: number, endMin: number, mode: string): PlayMove => ({
    id,
    start: startMin * MIN,
    end: endMin * MIN,
    mode,
});

describe('linkPlaysToMoves', () => {
    const moves = [move('train', 100, 200, 'IN_TRAIN'), move('walk', 200, 210, 'WALKING')];

    it('links plays overlapping a move enough and reports them per mode', () => {
        const result = linkPlaysToMoves(
            [
                play('inside', 110, 114),
                play('across', 198, 203),
                play('before', 90, 100.2),
                play('youtube', 150, 150, 'view'),
                play('after', 211, 214),
            ],
            moves,
            { minOverlapSeconds: 30 },
        );

        expect(result.links.map((link) => [link.playId, link.moveId, link.overlapSeconds])).toEqual([
            ['inside', 'train', 240],
            ['youtube', 'train', 0],
            ['across', 'train', 120],
            ['across', 'walk', 180],
        ]);
        expect(result.linkedPlays).toBe(3);
        expect(result.perMode).toEqual([
            { mode: 'IN_TRAIN', listens: 2, views: 1, minutes: 6, movesWithPlays: 1 },
            { mode: 'WALKING', listens: 1, views: 0, minutes: 3, movesWithPlays: 1 },
        ]);
    });

    it('accepts short plays fully inside a move and rejects ones only grazing it', () => {
        const result = linkPlaysToMoves(
            [play('skip', 120, 120.25), play('graze', 199.9, 205)],
            [move('train', 100, 200, 'IN_TRAIN')],
            { minOverlapSeconds: 30 },
        );

        expect(result.links.map((link) => link.playId)).toEqual(['skip']);
    });

    it('does not link a point play that started when the move ended', () => {
        expect(
            linkPlaysToMoves([play('next', 200)], [move('train', 100, 200, 'IN_TRAIN')], { minOverlapSeconds: 30 })
                .links,
        ).toEqual([]);
    });
});
