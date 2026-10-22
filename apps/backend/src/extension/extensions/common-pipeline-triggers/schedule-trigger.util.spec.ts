import { describe, expect, it } from 'vitest';
import {
    buildSchedulerId,
    type DesiredSchedule,
    planScheduleSync,
    toDesiredSchedule,
} from './schedule-trigger.util.js';

describe('toDesiredSchedule', () => {
    it('normalises whitespace and keeps a valid time zone', () => {
        expect(toDesiredSchedule(3, 1, { cron: '  30   3 * * * ', timezone: 'Europe/Berlin' })).toEqual({
            schedulerId: buildSchedulerId(3, 1),
            blueprintId: 3,
            nodeId: 1,
            pattern: '30 3 * * *',
            tz: 'Europe/Berlin',
        });
    });

    it('accepts six fields (seconds) and no time zone', () => {
        expect(toDesiredSchedule(1, 2, { cron: '0 */5 * * * *' })).toMatchObject({ pattern: '0 */5 * * * *' });
        expect(toDesiredSchedule(1, 2, { cron: '0 */5 * * * *' })).not.toHaveProperty('tz');
    });

    it('rejects missing or malformed expressions and unknown time zones', () => {
        expect(toDesiredSchedule(1, 1, undefined)).toHaveProperty('error');
        expect(toDesiredSchedule(1, 1, { cron: 42 })).toHaveProperty('error');
        expect(toDesiredSchedule(1, 1, { cron: '* * *' })).toHaveProperty('error');
        expect(toDesiredSchedule(1, 1, { cron: '* * * * * * *' })).toHaveProperty('error');
        expect(toDesiredSchedule(1, 1, { cron: '* * * * *', timezone: 'Mars/Olympus' })).toHaveProperty('error');
    });
});

describe('planScheduleSync', () => {
    const daily = toDesiredSchedule(1, 1, { cron: '30 3 * * *' }) as DesiredSchedule;
    const hourly = toDesiredSchedule(2, 4, { cron: '0 * * * *', timezone: 'UTC' }) as DesiredSchedule;

    it('registers new schedules', () => {
        expect(planScheduleSync([daily, hourly], [])).toEqual({ upsert: [daily, hourly], remove: [] });
    });

    it('leaves unchanged schedules alone', () => {
        expect(
            planScheduleSync(
                [daily, hourly],
                [
                    { id: daily.schedulerId, pattern: '30 3 * * *' },
                    { id: hourly.schedulerId, pattern: '0 * * * *', tz: 'UTC' },
                ],
            ),
        ).toEqual({ upsert: [], remove: [] });
    });

    it('re-registers changed patterns or time zones', () => {
        const plan = planScheduleSync(
            [daily, hourly],
            [
                { id: daily.schedulerId, pattern: '0 3 * * *' },
                { id: hourly.schedulerId, pattern: '0 * * * *' },
            ],
        );

        expect(plan.upsert).toEqual([daily, hourly]);
    });

    it('removes schedules of deleted blueprints but never foreign schedulers', () => {
        const plan = planScheduleSync(
            [daily],
            [
                { id: daily.schedulerId, pattern: '30 3 * * *' },
                { id: buildSchedulerId(9, 1), pattern: '* * * * *' },
                { id: 'something-else', pattern: '* * * * *' },
            ],
        );

        expect(plan).toEqual({ upsert: [], remove: [buildSchedulerId(9, 1)] });
    });
});
