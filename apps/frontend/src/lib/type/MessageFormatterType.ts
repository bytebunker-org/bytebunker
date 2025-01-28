type InterpolationValues = Record<string, string | number | boolean | Date | null | undefined> | undefined;
interface MessageObject {
    id: string;
    locale?: string;
    format?: string;
    default?: string;
    values?: InterpolationValues;
}

export type MessageFormatter = (id: string | MessageObject, options?: Omit<MessageObject, 'id'>) => string;
