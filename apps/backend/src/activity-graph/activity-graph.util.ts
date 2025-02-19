import { validate } from 'uuid';

export function extractASObjectId(id: string | undefined): string | undefined {
    if (!id) {
        return undefined;
    }

    // Split the string by '/' and get the last part
    const parts = id.split('/');
    const uuid = parts.at(-1);

    return uuid && validate(uuid) ? uuid : undefined;
}
