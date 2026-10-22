import type { GooglePlaceObjectInterface } from './google-place-object.interface.js';

/**
 * type: GooglePlace (as produced by the Google Maps saved places and reviews takeout files)
 */
export interface GoogleMapsPlaceObjectInterface extends GooglePlaceObjectInterface {
    /** Google's decimal customer id of the place, shared by the saved places and reviews exports. */
    cid?: string;

    address?: string;

    countryCode?: string;

    mapsUrl?: string;
}
