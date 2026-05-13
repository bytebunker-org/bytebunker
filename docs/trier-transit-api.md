# Trier Public Transit - Real-Time API

## VRT Bus Real-Time Departures (EFA API)

The VRT website at vrt-info.de is powered by **Mentz EFA** (Elektronische Fahrplanauskunft), hosted by VRN. The API works **without authentication** and returns **live delay data**.

### Key Endpoints

**Base URL:** `https://mandanten.vrn.de/vrt2/`

All requests use `itdLPxx_contractor=vrt`.

#### Stop Finder (search stops by name)
```
GET https://mandanten.vrn.de/vrt2/XSLT_STOPFINDER_REQUEST
  ?outputFormat=JSON
  &language=de
  &type_sf=any
  &name_sf=Trier+Hauptbahnhof
  &itdLPxx_contractor=vrt
```

#### Departure Monitor (real-time departures) - THE MAIN ONE
```
GET https://mandanten.vrn.de/vrt2/XSLT_DM_REQUEST
  ?outputFormat=JSON
  &language=de
  &type_dm=stopID
  &name_dm=17001318
  &useRealtime=1
  &itdLPxx_contractor=vrt
  &stateless=1
  &coordOutputFormat=WGS84[DD.DDDDD]
  &mode=direct
```

**Returns real delays!** Example response included `realtimeTripStatus: "MONITORED"` with actual delay data:
- Line 30 (SWT) to Waldrach: +13 min delay
- Line 3 (SWT) to Feyen: +2 min delay
- Line 22 (Moselbahn) to Schweich: on time

#### Trip/Journey Planner
```
GET https://mandanten.vrn.de/vrt2/XSLT_TRIP_REQUEST2
  ?itdLPxx_contractor=vrt
  &language=de
```

#### VRT's own frontend proxy
```
https://www.vrt-info.de/fahrplanauskunft/XSLT_DM_REQUEST?itdLPxx_contractor=vrt&language=en
https://www.vrt-info.de/fahrplanauskunft/XSLT_TRIP_REQUEST2
```

### Key Stop IDs

| Stop Name | Stop ID |
|---|---|
| Trier, Hauptbahnhof | **17001318** |
| Trier, Balduinsbrunnen/Hbf | **17001319** |

Use the Stop Finder endpoint to look up other stop IDs.

### Alternative Host

Same API also works via VRN's own frontend:
```
https://www.vrn.de/mngvrn/XSLT_DM_REQUEST?outputFormat=JSON&...
```

### Official Documented APIs (require registration)

| API | Format | Access | Notes |
|---|---|---|---|
| **TRIAS** | XML (VDV 431-2) | Register at [vrn.de/opendata](https://www.vrn.de/opendata/user/register) | Journey planning only, no real-time positions |
| **RapidJSON** (Mentz newer) | JSON | Register at VRN | [Training PDF](https://opendata.vrn.de/sites/default/files/2023-11/EFA_JSON_API_Training_EN_2.1.pdf) |

### System Details

- **Provider:** Mentz Datenverarbeitung GmbH (Munich) — [mentz.net](https://en.mentz.net/vrt-mobil-launched-in-trier/)
- **System:** EFA (same as VRR, MVV, VRN)
- **Mobile App:** VRT mobil (Mentz Gullivr platform, launched Oct 2024)
- **EFA Endpoints list:** https://github.com/SDS1234/EFA-Endpoints

---

## Deutsche Bahn (Trains at Trier Hbf)

### db.transport.rest (Free, no auth)
```
GET https://v6.db.transport.rest/stops/8000373/departures
```
- Rate limit: 100 req/min
- Covers: RB, RE, ICE, some buses
- GitHub: [public-transport/db-vendo-client](https://github.com/public-transport/db-vendo-client)

### DB Official GTFS-RT (requires API key)
- Request key via: `ris-gtfs@deutschebahn.com`
- Docs: [developer-docs.deutschebahn.com](https://developer-docs.deutschebahn.com/doku/datenstroeme/stroeme-gtfs-10582270)
- Real-time delays every 20 seconds

---

## GTFS Static Feeds

| Source | URL | Notes |
|---|---|---|
| **VRT buses** | `https://geoportal.vrn.de/services/sharing/rest/content/items/0acb30e1a008405bbb87c25045cfd0b7/data` | Weekly, CC BY 2.0, no rail |
| **Germany local transit** | `https://download.gtfs.de/germany/nv_free/latest.zip` | 231MB, CC BY 4.0 |
| **Germany regional rail** | `https://download.gtfs.de/germany/rv_free/latest.zip` | 12MB, CC BY 4.0 |
| **Germany long-distance** | `https://download.gtfs.de/germany/fv_free/latest.zip` | 348KB, CC BY 4.0 |
