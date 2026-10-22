/** BullMQ queue holding one job scheduler per schedule-trigger node; registered by the trigger module itself. */
export const SCHEDULE_TRIGGER_QUEUE = 'schedule-trigger';

const SCHEDULER_ID_PREFIX = 'blueprint-';

export interface ScheduleTriggerJobData {
    blueprintId: number;
    nodeId: number;
}

/** One schedule-trigger node as it should be registered with BullMQ. */
export interface DesiredSchedule extends ScheduleTriggerJobData {
    schedulerId: string;
    pattern: string;
    tz?: string;
}

/** The parts of a registered BullMQ job scheduler that decide whether it is still up to date. */
export interface RegisteredSchedule {
    id: string;
    pattern?: string;
    tz?: string;
}

export interface ScheduleSyncPlan {
    upsert: DesiredSchedule[];
    remove: string[];
}

export function buildSchedulerId(blueprintId: number, nodeId: number): string {
    return `${SCHEDULER_ID_PREFIX}${blueprintId}-node-${nodeId}`;
}

/**
 * Turns a schedule-trigger node's constant input into the scheduler to register, or an error message. Only a cheap
 * shape check here: BullMQ parses the expression itself when the scheduler is registered and rejects invalid ones.
 */
export function toDesiredSchedule(
    blueprintId: number,
    nodeId: number,
    input: { cron?: unknown; timezone?: unknown } | undefined,
): DesiredSchedule | { error: string } {
    const cron = typeof input?.cron === 'string' ? input.cron.trim().replaceAll(/\s+/g, ' ') : '';
    const fieldCount = cron ? cron.split(' ').length : 0;

    if (fieldCount < 5 || fieldCount > 6) {
        return { error: `cron must be a cron expression with 5 or 6 fields, got "${String(input?.cron ?? '')}"` };
    }

    const timezone = typeof input?.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : undefined;

    if (timezone && !isValidTimeZone(timezone)) {
        return { error: `timezone "${timezone}" is not a known IANA time zone` };
    }

    return {
        schedulerId: buildSchedulerId(blueprintId, nodeId),
        blueprintId,
        nodeId,
        pattern: cron,
        ...(timezone ? { tz: timezone } : {}),
    };
}

/**
 * Which schedulers to (re-)register and which to remove so BullMQ matches the blueprints. Unchanged schedulers are
 * left alone: re-registering them on every sync would be harmless but needlessly rewrites their next run.
 * Schedulers not created by this trigger (other id prefix) are never touched.
 */
export function planScheduleSync(desired: DesiredSchedule[], registered: RegisteredSchedule[]): ScheduleSyncPlan {
    const registeredById = new Map(registered.map((schedule) => [schedule.id, schedule]));
    const desiredIds = new Set(desired.map((schedule) => schedule.schedulerId));

    return {
        upsert: desired.filter((schedule) => {
            const existing = registeredById.get(schedule.schedulerId);

            return !existing || existing.pattern !== schedule.pattern || (existing.tz ?? undefined) !== schedule.tz;
        }),
        remove: registered
            .filter((schedule) => schedule.id.startsWith(SCHEDULER_ID_PREFIX) && !desiredIds.has(schedule.id))
            .map((schedule) => schedule.id),
    };
}

function isValidTimeZone(timeZone: string): boolean {
    try {
        new Intl.DateTimeFormat('en', { timeZone });

        return true;
    } catch {
        return false;
    }
}
