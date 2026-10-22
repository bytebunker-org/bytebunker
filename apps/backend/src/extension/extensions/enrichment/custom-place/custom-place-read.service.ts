import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { CustomPlaceRule } from '../util/custom-places.util.js';
import { CustomPlaceEntity } from './entity/custom-place.entity.js';

/**
 * Reads the custom places for the enrichment modules as plain data. Within one pipeline execution every module sees
 * the same custom places: they are read once per execution (the last execution's result is kept).
 */
@Injectable()
export class CustomPlaceReadService {
    private cached: { executionId: number; rules: Promise<CustomPlaceRule[]> } | undefined;

    constructor(private readonly em: EntityManager) {}

    public readForExecution(executionId: number): Promise<CustomPlaceRule[]> {
        if (this.cached?.executionId !== executionId) {
            const rules = this.readAll();
            this.cached = { executionId, rules };
            // A failed read must not stick for the rest of the execution.
            rules.catch(() => {
                if (this.cached?.rules === rules) {
                    this.cached = undefined;
                }
            });
        }

        return this.cached.rules;
    }

    public async readAll(): Promise<CustomPlaceRule[]> {
        const entities = await this.em
            .fork()
            .find(CustomPlaceEntity, {}, { orderBy: { id: 'asc' }, disableIdentityMap: true });

        return entities.map(toCustomPlaceRule);
    }
}

export function toCustomPlaceRule(entity: CustomPlaceEntity): CustomPlaceRule {
    return {
        id: entity.id,
        name: entity.name,
        latitude: entity.latitude,
        longitude: entity.longitude,
        radiusMeters: entity.radiusMeters,
        role: entity.role,
        ...(entity.validFrom ? { validFrom: toDay(entity.validFrom) } : {}),
        ...(entity.validTo ? { validTo: toDay(entity.validTo) } : {}),
    };
}

/** `YYYY-MM-DD`; tolerates a driver that hands out `date` columns as (local midnight) Date objects. */
export function toDay(value: unknown): string {
    if (value instanceof Date) {
        const pad = (n: number) => String(n).padStart(2, '0');

        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }

    return String(value).slice(0, 10);
}
