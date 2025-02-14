import type { ASStringFallback } from './activity-streams-util.type.js';

export function createUnknownASType(type: string): ASStringFallback {
    return type as ASStringFallback;
}
