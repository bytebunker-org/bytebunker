import type { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';

/** Properties that differ between a visit and its identical nested copy without making them different visits. */
const IGNORED_PROPERTIES = new Set(['stableKeys', 'hierarchyLevel']);

/**
 * Drops activities that are identical to an earlier one. Google's exports contain the same segment twice (e.g. a
 * visit repeated as its own nested child with the same place and times); each copy would otherwise get its own key.
 */
export function collapseIdenticalActivities<T extends ActivityDto>(activities: T[]): T[] {
    const seen = new Set<string>();

    return activities.filter((activity) => {
        const fingerprint = JSON.stringify(activity, (key, value: unknown) =>
            IGNORED_PROPERTIES.has(key) ? undefined : value,
        );

        if (seen.has(fingerprint)) {
            return false;
        }

        seen.add(fingerprint);
        return true;
    });
}
