import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Neode } from '@bytebunker/neode';
import { NEODE_PROVIDER } from '../../../../activity-graph/graph-database/neode.constant.js';
import { NodeLabelEnum } from '../../../../activity-graph/node-label.enum.js';
import { RelationshipLabelEnum } from '../../../../activity-graph/relationship-label.enum.js';
import { PipelineBlueprintEntity } from '../../../../etl/pipeline/blueprint/entity/pipeline-blueprint.entity.js';
import { ScheduleTriggerService } from '../../common-pipeline-triggers/schedule-trigger.service.js';
import { toPlainNumber } from '../graph/derived-graph.util.js';
import { matchCustomPlace } from '../util/custom-places.util.js';
import { parseGraphTime } from '../util/role-periods.util.js';
import { CustomPlaceReadService, toDay } from './custom-place-read.service.js';
import { CustomPlaceRoleEnum } from './dto/custom-place-role.enum.js';
import {
    CUSTOM_PLACE_DEFAULT_RADIUS_METERS,
    type CreateCustomPlaceDto,
    type CustomPlaceApplyResultDto,
    type CustomPlaceSuggestionDto,
    type UpdateCustomPlaceDto,
} from './dto/custom-place.dto.js';
import { CustomPlaceEntity } from './entity/custom-place.entity.js';

/** Shipped blueprint that consolidates, geocodes and derives home/work; it applies the custom places. */
export const PLACES_BLUEPRINT_KEY = 'enrichment/places';
const SUGGESTION_LIMIT = 25;
/** Most visited places read before dropping the covered ones. */
const SUGGESTION_CANDIDATES = 200;

@Injectable()
export class CustomPlaceService {
    constructor(
        private readonly em: EntityManager,
        @Inject(NEODE_PROVIDER) private readonly neode: Neode,
        private readonly customPlaceReadService: CustomPlaceReadService,
        private readonly scheduleTriggerService: ScheduleTriggerService,
    ) {}

    public findAll(): Promise<CustomPlaceEntity[]> {
        return this.em.fork().find(CustomPlaceEntity, {}, { orderBy: { role: 'asc', name: 'asc', id: 'asc' } });
    }

    public findOne(id: number): Promise<CustomPlaceEntity> {
        return this.em.fork().findOneOrFail(CustomPlaceEntity, { id });
    }

    public create(data: CreateCustomPlaceDto): Promise<CustomPlaceEntity> {
        assertValidity(data.validFrom, data.validTo);

        return this.em.fork().transactional((em) => {
            const entity = em.create(CustomPlaceEntity, {
                name: data.name.trim(),
                latitude: data.latitude,
                longitude: data.longitude,
                radiusMeters: data.radiusMeters ?? CUSTOM_PLACE_DEFAULT_RADIUS_METERS,
                role: data.role ?? CustomPlaceRoleEnum.OTHER,
                validFrom: data.validFrom || null,
                validTo: data.validTo || null,
                notes: data.notes?.trim() || null,
            });

            return Promise.resolve(entity);
        });
    }

    public update(id: number, data: UpdateCustomPlaceDto): Promise<CustomPlaceEntity> {
        return this.em.fork().transactional(async (em) => {
            const entity = await em.findOneOrFail(CustomPlaceEntity, { id });

            if (data.name !== undefined) {
                entity.name = data.name.trim();
            }

            for (const key of ['latitude', 'longitude', 'radiusMeters', 'role'] as const) {
                if (data[key] !== undefined && data[key] !== null) {
                    (entity as unknown as Record<string, unknown>)[key] = data[key];
                }
            }

            if (data.validFrom !== undefined) {
                entity.validFrom = data.validFrom || null;
            }

            if (data.validTo !== undefined) {
                entity.validTo = data.validTo || null;
            }

            if (data.notes !== undefined) {
                entity.notes = data.notes?.trim() || null;
            }

            assertValidity(entity.validFrom, entity.validTo);

            return entity;
        });
    }

    /** The graph keeps the custom name until the next run of the places blueprint (or {@link apply}). */
    public async remove(id: number): Promise<void> {
        const deleted = await this.em.fork().nativeDelete(CustomPlaceEntity, { id });

        if (!deleted) {
            throw new NotFoundException(`Custom place ${id} not found`);
        }
    }

    /**
     * The most visited canonical places that no custom place covers yet, with the role their home/work periods give
     * them, so the user can adopt them.
     */
    public async suggestions(): Promise<CustomPlaceSuggestionDto[]> {
        const customPlaces = await this.customPlaceReadService.readAll();
        const result = await this.neode.readCypher(
            `MATCH (c:${NodeLabelEnum.AS_OBJECT}:${NodeLabelEnum.CANONICAL_PLACE})
             WHERE c.visitCount > 0 AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
             WITH c ORDER BY c.visitCount DESC, c.id LIMIT ${SUGGESTION_CANDIDATES}
             RETURN c.id AS id, c.name AS name, c.nameSource AS nameSource, c.city AS city, c.country AS country,
                    c.latitude AS latitude, c.longitude AS longitude, c.visitCount AS visitCount,
                    [(c)<-[r:${RelationshipLabelEnum.HOME_DURING}]-() | [r.from, r.to]] AS homePeriods,
                    [(c)<-[r:${RelationshipLabelEnum.WORK_DURING}]-() | [r.from, r.to]] AS workPeriods`,
        );
        const suggestions: CustomPlaceSuggestionDto[] = [];

        for (const record of result.records) {
            const latitude = Number(record.get('latitude'));
            const longitude = Number(record.get('longitude'));

            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                continue;
            }

            if (matchCustomPlace({ latitude, longitude }, customPlaces)) {
                continue;
            }

            const homePeriods = record.get('homePeriods') as unknown[][];
            const workPeriods = record.get('workPeriods') as unknown[][];
            const rolePeriods =
                homePeriods.length >= workPeriods.length && homePeriods.length
                    ? { role: CustomPlaceRoleEnum.HOME, periods: homePeriods }
                    : workPeriods.length
                      ? { role: CustomPlaceRoleEnum.WORK, periods: workPeriods }
                      : undefined;
            const froms = rolePeriods?.periods.map((period) => parseGraphTime(period[0])).filter(isNumber) ?? [];
            const tos = rolePeriods?.periods.map((period) => parseGraphTime(period[1])).filter(isNumber) ?? [];

            suggestions.push({
                id: String(record.get('id')),
                ...optionalString('name', record.get('name')),
                ...optionalString('nameSource', record.get('nameSource')),
                ...optionalString('city', record.get('city')),
                ...optionalString('country', record.get('country')),
                latitude,
                longitude,
                visitCount: toPlainNumber(record.get('visitCount')),
                ...(rolePeriods ? { inferredRole: rolePeriods.role } : {}),
                ...(froms.length ? { roleFrom: new Date(Math.min(...froms)).toISOString() } : {}),
                ...(tos.length ? { roleTo: new Date(Math.max(...tos)).toISOString() } : {}),
            });

            if (suggestions.length >= SUGGESTION_LIMIT) {
                break;
            }
        }

        return suggestions;
    }

    /** Starts the place enrichment blueprint now, as if its nightly schedule fired. */
    public async apply(): Promise<CustomPlaceApplyResultDto> {
        const blueprint = await this.em
            .fork()
            .findOne(PipelineBlueprintEntity, { key: PLACES_BLUEPRINT_KEY }, { fields: ['id'] });

        if (!blueprint) {
            throw new NotFoundException(`The shipped blueprint ${PLACES_BLUEPRINT_KEY} is not installed`);
        }

        const result = await this.scheduleTriggerService.fire(blueprint.id);

        if (result.outcome === 'not-found') {
            throw new NotFoundException(result.reason);
        }

        return {
            outcome: result.outcome,
            blueprintId: blueprint.id,
            ...(result.executionIds[0] === undefined ? {} : { executionId: result.executionIds[0] }),
            ...(result.reason ? { reason: result.reason } : {}),
        };
    }
}

function assertValidity(validFrom: string | null | undefined, validTo: string | null | undefined): void {
    if (validFrom && validTo && toDay(validFrom) > toDay(validTo)) {
        throw new BadRequestException('validFrom must not be after validTo');
    }
}

function optionalString<K extends string>(key: K, value: unknown): Partial<Record<K, string>> {
    return typeof value === 'string' && value ? ({ [key]: value } as Record<K, string>) : {};
}

function isNumber(value: number | undefined): value is number {
    return value !== undefined;
}
