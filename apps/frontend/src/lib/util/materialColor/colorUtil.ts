import hash from 'string-hash';
import {
	availableMaterialColorShades,
	materialColorMap,
	type MaterialColorName,
	materialColors,
	type MaterialColorShade
} from '$lib/util/materialColor/materialColors.js';

const materialWhite = 'rgba(255, 255, 255, 1)';
const materialBlack = 'rgba(0, 0, 0, 0.87)';

/* Get the whole color object, including all the shades, name and white breakpoint */
function getColorObj(text: string) {
	const hashedText = hash(text);
	const colorIndex = hashedText % materialColors.length;

	return materialColors[colorIndex];
}

interface MaterialColorInfo {
	backgroundColor: string;
	color: string;
	materialColorName: MaterialColorName;
	foreground: 'light' | 'dark';
}

/* Get a ready-to-use Style object of the Material color of a string */
export function hashTextToMaterialStyleColor(
	text: string,
	shade: MaterialColorShade = 500
): MaterialColorInfo {
	if (!availableMaterialColorShades.includes(shade)) {
		shade = 500;
	}

	const colorObj = getColorObj(text);

	const foreground = shade >= colorObj.whiteBreakpoint ? 'light' : 'dark';

	return {
		backgroundColor: colorObj.shades[shade],
		color: foreground === 'light' ? materialWhite : materialBlack,
		materialColorName: colorObj.name as MaterialColorName,
		foreground
	};
}

export function getMaterialColorDetails(
	name: MaterialColorName,
	shade: MaterialColorShade
): MaterialColorInfo {
	if (!availableMaterialColorShades.includes(shade)) {
		shade = 500;
	}

	const colorObj = materialColorMap[name];

	const foreground = shade >= colorObj.whiteBreakpoint ? 'light' : 'dark';
	return {
		backgroundColor: colorObj.shades[shade],
		color: foreground === 'light' ? materialWhite : materialBlack,
		materialColorName: colorObj.name as MaterialColorName,
		foreground
	};
}

/**
 *
 * @param backgroundColor the background color in #rrggbb format
 * @see https://www.w3.org/TR/AERT/#color-contrast
 */
export function getAccompanyingTextColor(backgroundColor: string): string {
	return isLightColor(backgroundColor) ? materialBlack : materialWhite;
}

/**
 *
 * @param color the color in #rrggbb format
 * @see https://www.w3.org/TR/AERT/#color-contrast
 */
export function isLightColor(color: string): boolean {
	const red = parseInt(color.substring(0, 2), 16);
	const green = parseInt(color.substring(2, 4), 16);
	const blue = parseInt(color.substring(4, 6), 16);
	const brightness = red * 0.299 + green * 0.587 + blue * 0.114;

	return brightness > 180;
}
