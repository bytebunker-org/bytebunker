import type { ActivityTypeEnum } from '@bytebunker/event-schema/extension/google';
import type { Component } from 'svelte';

import LucideRoute from '~icons/lucide/route';
import LucideBusFront from '~icons/lucide/bus-front';
import LucideBike from '~icons/lucide/bike';
import LucideShip from '~icons/lucide/ship';
import LucideSailboat from '~icons/lucide/sailboat';
import LucidePlane from '~icons/lucide/plane';
import LucideHiking from '~icons/lucide/mountain';
import LucideTrain from '~icons/lucide/train';
import LucideCableCar from '~icons/lucide/cable-car';
import LucideFerry from '~icons/lucide/ship';
import LucideTramFront from '~icons/lucide/tram-front';
import LucideTrainFrontTunnel from '~icons/lucide/train-front-tunnel';
import LucideCarTaxiFront from '~icons/lucide/car-taxi-front';
import LucideCar from '~icons/lucide/car';
import LucideAccessibility from '~icons/lucide/accessibility';
import LucideWind from '~icons/lucide/wind';
import LucideSailing from '~icons/lucide/sailboat';
import LucideSnowflake from '~icons/lucide/snowflake';
import LucideRouteOff from '~icons/lucide/route-off';
import LucideWavesLadder from '~icons/lucide/waves-ladder';
import LucideFootprints from '~icons/lucide/footprints';

export const googleActivityTypeIconMap = {
	BOATING: LucideShip,
	CATCHING_POKEMON: LucideFootprints,
	CYCLING: LucideBike,
	FLYING: LucidePlane,
	HIKING: LucideHiking,
	HORSEBACK_RIDING: LucideRoute,
	IN_BUS: LucideBusFront,
	IN_CABLECAR: LucideCableCar,
	IN_FERRY: LucideFerry,
	IN_FUNICULAR: LucideTrain,
	IN_GONDOLA_LIFT: LucideCableCar,
	IN_PASSENGER_VEHICLE: LucideCar,
	IN_SUBWAY: LucideTrainFrontTunnel,
	IN_TAXI: LucideCarTaxiFront,
	IN_TRAIN: LucideTrain,
	IN_TRAM: LucideTramFront,
	IN_VEHICLE: LucideCar,
	IN_WHEELCHAIR: LucideAccessibility,
	KAYAKING: LucideSailboat,
	KITESURFING: LucideWind,
	MOTORCYCLING: LucideBike,
	PARAGLIDING: LucideRoute,
	ROWING: LucideSailboat,
	RUNNING: LucideFootprints,
	SAILING: LucideSailing,
	SKATEBOARDING: LucideRoute,
	SKATING: LucideSnowflake,
	SKIING: LucideSnowflake,
	SLEDDING: LucideSnowflake,
	SNOWBOARDING: LucideSnowflake,
	SNOWMOBILE: LucideSnowflake,
	SNOWSHOEING: LucideSnowflake,
	STILL: LucideRouteOff,
	SURFING: LucideWavesLadder,
	SWIMMING: LucideWavesLadder,
	UNKNOWN_ACTIVITY_TYPE: LucideRoute,
	WALKING: LucideFootprints,
	WALKING_NORDIC: LucideFootprints
} satisfies Record<ActivityTypeEnum, Component>;
