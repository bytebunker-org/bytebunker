import type { Transport } from '@sveltejs/kit';
import { DateTime } from 'luxon';

export const transport: Transport = {
	DateTime: {
		encode: (value) => DateTime.isDateTime(value) && value.toISO(),
		decode: (value) => DateTime.fromISO(value)
	}
};
