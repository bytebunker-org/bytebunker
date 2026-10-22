/** Synthetic lookalikes of the Google Maps GeoJSON takeout files. Names, ids and texts are made up. */

export const SAVED_PLACES_DE = JSON.stringify({
    type: 'FeatureCollection',
    features: [
        {
            geometry: { coordinates: [2.5, 48.5], type: 'Point' },
            properties: {
                date: '2024-08-26T03:49:31Z',
                google_maps_url: 'http://maps.google.com/?cid=1234567890123456789',
                location: {
                    address: '1 Beispielweg, 12345 Musterstadt, Frankreich',
                    country_code: 'FR',
                    name: 'Beispiel Hostel',
                },
            },
            type: 'Feature',
        },
        {
            geometry: { coordinates: [0, 0], type: 'Point' },
            properties: {
                date: '2023-07-19T22:32:40Z',
                google_maps_url: 'http://maps.google.com/?q=49.5,6.25',
                Comment: 'Für diesen gespeicherten Ort sind keine Informationen verfügbar',
            },
            type: 'Feature',
        },
        {
            geometry: { coordinates: [0, 0], type: 'Point' },
            properties: {
                date: '2014-11-23T18:33:06Z',
                google_maps_url: 'http://maps.google.com/?q=Teststadt, 11111 Teststadt&ftid=0x1000000000000001:0xff',
                Comment: 'Für diesen gespeicherten Ort sind keine Informationen verfügbar',
            },
            type: 'Feature',
        },
        {
            geometry: { coordinates: [0, 0], type: 'Point' },
            properties: { google_maps_url: 'http://maps.google.com/?cid=1' },
            type: 'Feature',
        },
    ],
});

export const REVIEWS_DE = JSON.stringify({
    type: 'FeatureCollection',
    features: [
        {
            geometry: { coordinates: [6.5, 49.5], type: 'Point' },
            properties: {
                date: '2024-05-15T08:36:40.925315Z',
                five_star_rating_published: 4,
                review_text_published: 'Nett und schnell.',
                google_maps_url: 'https://www.google.com/maps/place//data=!4m2!3m1!1s0x0:0xff',
                location: {
                    address: 'Teststraße 1, 12345 Teststadt, Deutschland',
                    country_code: 'DE',
                    name: 'Testsalon',
                },
            },
            type: 'Feature',
        },
        {
            geometry: { coordinates: [6.6, 49.6], type: 'Point' },
            properties: {
                date: '2022-12-13T20:28:59.050918Z',
                five_star_rating_published: 5,
                google_maps_url: 'https://www.google.com/maps/place//data=!4m2!3m1!1s0x0:0x100',
                location: { address: 'Teststraße 2, 12345 Teststadt', name: 'Testladen' },
            },
            type: 'Feature',
        },
    ],
});

export const REVIEWS_EN = JSON.stringify({
    type: 'FeatureCollection',
    features: [
        {
            geometry: { coordinates: [6.5, 49.5], type: 'Point' },
            properties: {
                'Google Maps URL': 'https://www.google.com/maps/place//data=!4m2!3m1!1s0x0:0xff',
                Location: {
                    Address: 'Teststraße 1, 12345 Teststadt, Germany',
                    'Business Name': 'Testsalon',
                    'Country Code': 'DE',
                    'Geo Coordinates': { Latitude: '49.5000000', Longitude: '6.5000000' },
                },
                Published: '2019-09-29T17:16:05.575Z',
                'Review Comment': 'Echt gut!',
                'Star Rating': 5,
            },
            type: 'Feature',
        },
        {
            geometry: { coordinates: [0, 0], type: 'Point' },
            properties: {
                'Google Maps URL': 'https://www.google.com/maps/place//data=!4m2!3m1!1s0x0:0x2a',
                Published: '2017-01-30T19:46:48.686Z',
                'Star Rating': 3,
                Comment: 'No location information is available for this review',
            },
            type: 'Feature',
        },
    ],
});

/** Labeled places carry no dates and no Maps URL, so they must not be detected. */
export const LABELED_PLACES_EN = JSON.stringify({
    type: 'FeatureCollection',
    features: [
        { geometry: { coordinates: [49.7, 6.6], type: 'Point' }, properties: { name: 'Home' }, type: 'Feature' },
    ],
});
