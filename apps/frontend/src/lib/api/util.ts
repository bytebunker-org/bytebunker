import { DateTime } from 'luxon';

export const isoDateFormat =
	/^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)$/;

export function convertIsoToDateTime<Input extends Record<string, any> | Record<string, any>[]>(
	obj: Record<string, any> | Record<string, any>[]
): Input {
	// deep-clone object
	return JSON.parse(JSON.stringify(obj), (_, value) => {
		if (typeof value === 'string' && isoDateFormat.test(value)) {
			return DateTime.fromISO(value);
		}

		return value;
	}) as Input;
}

export function convertDateTimeToIso<
	Input extends DateTime | Record<string, any> | Record<string, any>[] | null | undefined
>(obj: Input): Input {
	if (!obj) {
		return obj;
	}

	// deep-clone object
	return JSON.parse(
		JSON.stringify(obj, (_, value) => {
			if (DateTime.isDateTime(value)) {
				return value.toISO();
			}

			return value;
		})
	) as Input;
}
