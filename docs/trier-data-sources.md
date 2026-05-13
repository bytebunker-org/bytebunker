# Trier & Region - OSINT & Open Data Sources

Inspired by [WorldView](https://www.spatialintelligence.ai/p/i-built-a-spy-satellite-simulator) — a browser-based spy satellite simulator that layers real-time OSINT data (ADS-B flights, ship AIS, CCTV cameras, satellite tracking) over Google's Photorealistic 3D Tiles. This document explores what similar data sources exist focused on **Trier** and the surrounding region (Rheinland-Pfalz, Luxembourg, Saarland).

### Detailed Sub-Documents
- **[trier-webcams.md](./trier-webcams.md)** — 30+ webcams with direct image URLs, OSINT discovery methods (Shodan, Censys, OSM Overpass)
- **[trier-transit-api.md](./trier-transit-api.md)** — VRT EFA real-time bus API (works without auth!), DB train APIs, GTFS feeds
- **[cita-cameras-map.html](./cita-cameras-map.html)** — Interactive Leaflet map of 222 Luxembourg highway cameras

---

## 1. Aircraft Tracking (ADS-B)

Real-time aircraft positions over Trier and the region. Germany has excellent ADS-B receiver coverage.

| Source | API / Access | Cost | Notes |
|---|---|---|---|
| **OpenSky Network** | REST API: `https://opensky-network.org/api/states/all?lamin=49.5&lomin=6.3&lamax=50.2&lomax=7.1` | Free (400 credits/day anon, 4000 registered) | Best free option. 5-10s resolution. Bounding box queries. |
| **airplanes.live / ADSB One** | REST API: `https://api.adsb.one` | Free (1 req/s) | Unfiltered (no government censoring). ADSBExchange v2 format. |
| **Flightradar24** | `https://fr24api.flightradar24.com/` | Paid (sandbox free) | Commercial. Most comprehensive but expensive. |

**Local airports:**
- **Trier-Fohren (EDRT)** — small GA airfield, 15km north of Trier
- **Luxembourg Findel (ELLX/LUX)** — major international airport, ~50km away. Luxembourg government publishes an open API for arrivals/departures.

---

## 2. Mosel Ship & Barge Tracking (AIS)

Inland AIS transponders are **mandatory** on the Mosel since 2016. Shore-based AIS stations cover the entire river.

| Source | Access | Notes |
|---|---|---|
| **MarineTraffic** | Free viewer, paid API | Best coverage. `marinetraffic.com` |
| **VesselFinder** | Free viewer | `vesselfinder.com` — also has AIS sharing program |
| **FleetMon** | Free viewer, paid API | Inland waterway focus |
| **ShipTraffic.net** | Free viewer | River-specific: `shiptraffic.net/2016/04/rivers-ship-traffic.html` |
| **Moselkommission** | Statistics (PDF) | Annual ship counts & cargo by lock: `moselkommission.org/die-mosel/schifffahrt` |

---

## 3. Mosel Water Levels & Flood Data

| Source | API | Notes |
|---|---|---|
| **Pegelonline (WSV)** | REST: `https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/TRIER%20UP/W` | Free (DL-DE-Zero-2.0). 1-60min resolution. 30 days history. OpenAPI at `pegel-online.api.bund.dev` |
| **RLP Wasserportal** | WMS/WFS: `https://wasserportal.rlp-umwelt.de/` | State-level water data. Direct gauge: `https://geodaten-wasser.rlp-umwelt.de/wasserstand/2676060100` |
| **Hochwassermeldedienst RLP** | Web: `https://www.hochwasser.rlp.de/flussgebiet/mosel/trier` | Flood warnings for Mosel/Trier |
| **ELWIS** | Web: `https://www.elwis.de/` | Federal waterway info: navigation charts, bridge clearance, shipping notices |
| **Luxembourg Inondations** | Web: `https://www.inondations.lu/basins/moselle` | Cross-border Mosel flood data |

---

## 4. Weather & Climate

| Source | API | Notes |
|---|---|---|
| **Bright Sky** (DWD wrapper) | `https://api.brightsky.dev/weather?lat=49.75&lon=6.64&date=YYYY-MM-DD` | **Best option.** Free JSON API, no key needed. MOSMIX forecasts + station data. |
| **DWD Open Data** | FTP: `https://opendata.dwd.de/climate_environment/CDC/` | Raw station data (CSV). Historical + recent. |
| **BundesAPI DWD** | `https://dwd.api.bund.dev/` | OpenAPI wrapper for selected DWD endpoints |
| **Wetterdienst** (Python) | `pip install wetterdienst` | Unified Python client for DWD + other sources |

---

## 5. Air Quality & Pollution

| Source | API | Notes |
|---|---|---|
| **Umweltbundesamt (UBA)** | REST: `https://luftdaten.umweltbundesamt.de/api/air-data/v4/` | Official monitoring. PM, NO2, O3, SO2, CO. OpenAPI at `luftqualitaet.api.bund.dev` |
| **Sensor.Community** (citizen science) | Map: `https://maps.sensor.community/` | DIY low-cost sensors. Confirmed sensors in Trier-Pfalzel/Ehrang-Quint area. CSV download + API. |
| **LfU RLP** | WMS/WFS: `https://map-final.rlp-umwelt.de/kartendienste/mod_ogc/index.php` | State environmental services |

---

## 6. Traffic & Autobahn Data

### Autobahn API (Federal)
Official REST API from Autobahn GmbH. OpenAPI docs: `https://autobahn.api.bund.dev/`

| Endpoint | URL Pattern |
|---|---|
| Roadworks | `https://verkehr.autobahn.de/o/autobahn/{A1,A64,A602}/services/roadworks` |
| Warnings | `https://verkehr.autobahn.de/o/autobahn/{hwy}/services/warning` |
| Closures | `https://verkehr.autobahn.de/o/autobahn/{hwy}/services/closure` |
| Parking (HGV) | `https://verkehr.autobahn.de/o/autobahn/{hwy}/services/parking_lorry` |
| EV Charging | `https://verkehr.autobahn.de/o/autobahn/{hwy}/services/electric_charging_station` |

**Note:** Autobahn webcams for A1/A64/A602 currently return empty arrays. German federal/state highway webcams are **suspended** due to Ukraine war security directive (per LBM RLP).

### Other Traffic Sources
| Source | Access | Notes |
|---|---|---|
| **BASt Dauerzahlstellen** | CSV bulk download: `bast.de/DE/Publikationen/Daten/Verkehrstechnik/DZ.html` | Hourly traffic counts from permanent sensors on Autobahnen. Historical data. |
| **Mobilithek** | DATEX II: `mobilithek.info` | National access point. Real-time traffic flow, incidents, construction. |
| **BaustellenInfo RLP** | WMS/WFS: `baustelleninfo.rlp.de` | Construction data for all of RLP. Feeds into Mobilithek. |
| **Trier Construction Map** | Web: `trier.de/leben-in-trier/verkehr-mobilitaet/baustellen` | City-level roadwork map |

### Trier Smart City / KIM Traffic Sensors
Trier ranks **2nd in Germany's Smart City Index** for cities its size. The city is deploying 45 dynamic LED signs with sensors collecting traffic counts, parking availability, weather, and emissions data (KIM system, expected operational spring 2026).
- DLR project page: `https://www.dlr.de/en/ts/research-transfer/projects/vs-trier`
- Bitkom Smart City Index: `https://www.bitkom.org/Smart-City-2025/Trier`

---

## 7. Parking (Parkleitsystem Trier)

SWT Parken operates 7 city-center garages (~3,200 spaces) with live availability updated every 15 minutes.

- **Live overview:** `https://www.swt.de/p/Aktuell_freie_Parkplaetze_auf_einen_Blick-5-471.html`
- **Garages:** Ostallee, Konstantin, City, Basilika, Viehmarkt, Hauptmarkt, Plaza-Carree
- **Note:** No public REST API documented. Data loaded via Next.js client-side. Could be scraped.
- **ParkenDD** open source project (`github.com/ParkenDD/park-api-v3`) aggregates city parking data — Trier not yet integrated but framework supports HTML scraping.

---

## 8. Public Transit (Buses & Trains)

### VRT / SWT Buses (Trier City & Region)

| Source | Format | URL | Notes |
|---|---|---|---|
| **VRT GTFS Static** | GTFS ZIP | Direct: `https://geoportal.vrn.de/services/sharing/rest/content/items/0acb30e1a008405bbb87c25045cfd0b7/data` | Weekly updates. CC BY 2.0. All VRT bus routes (no rail). |
| **VRT GTFS Archive** | GTFS ZIP | `https://opendata.vrn.de/datasets/vrt-gtfs-sollfahrplandaten-archiv` | Historical schedules |
| **VRT TRIAS API** | XML | Register at `vrn.de/opendata` | Journey planning. No real-time positions. |
| **VRT Datasets page** | Various | `https://www.vrt-info.de/service/webseitenbetreiber/datensaetze` | Also VDV 452 format, stop directory CSV |

**Gap:** No public GTFS-Realtime feed for VRT/SWT buses. Real-time GPS data exists (shared with Google Maps) but not exposed via public API.

### Deutsche Bahn (Trains)

| Source | Format | Access | Notes |
|---|---|---|---|
| **db.transport.rest** | REST/JSON | Free, no key: `https://v6.db.transport.rest/` | Unofficial. Departures, journeys, stops. 100 req/min. Works for Trier Hbf. |
| **DB Official GTFS + GTFS-RT** | GTFS | API key via `ris-gtfs@deutschebahn.com` | Official. Real-time delays every 20s. DB Fernverkehr + DB Regio. |
| **gtfs.de** | GTFS ZIP | Free: `https://gtfs.de/en/feeds/` | CC BY 4.0. Daily from DELFI. Local transit (231MB), regional rail (12MB), long-distance (348KB). |
| **DELFI / OpenData OEPNV** | GTFS/NeTEx | Register: `opendata-oepnv.de` | All of Germany. 2M+ trips, 500K+ stops. |

---

## 9. Webcams & Cameras

### Trier City

| Camera | URL | Notes |
|---|---|---|
| **Blandine-Merten-Realschule** | `http://webcam.bmrtrier.de/webcam/wetter.jpg` | JPEG, city-south/center panorama |
| **Flugplatz Trier-Fohren** | `http://flugplatz-trier.de/` | Tower/runway view |
| **Trier official page** | `https://www.trier.de/leben-in-trier/trier-auf-einen-blick/webcams/` | Lists active webcams |
| **Stadtpanoramen** | `https://www.stadtpanoramen.de/trier/` | 360 panoramas: Hauptmarkt, Porta Nigra, Dom, Amphitheater, Zurlauben, etc. |

### Luxembourg A1 Highway (toward Trier) — CITA

Luxembourg has excellent camera coverage on the A1 motorway connecting to Trier!

| Resource | URL | Notes |
|---|---|---|
| **CITA A1 Webcams** | `https://www.cita.lu/en/webcam/a1.html` | Live JPEG stills from 18 cameras |
| **CITA JPEG URL pattern** | `https://www.cita.lu/info_trafic/cameras/images/cccam_{ID}.jpg` | Per-camera still images |
| **ACL HLS Live Streams** | `https://live-edge.rtl.lu/cita/cita_a1/playlist.m3u8` | **Live video stream** of A1! Also A3, A4, A6, A7, A13. |
| **Camera Locations KML** | `https://www.cita.lu/kml/cameras.kml` | 222 camera positions. CC0 license. |
| **Luxembourg Open Data** | `https://data.public.lu/en/datasets/cita-cameras-autoroute/` | Official dataset |
| **Wasserbillig border webcam** | `skylinewebcams.com/.../wasserbillig.html` | Border crossing view |

---

## 10. News & Emergency Services (Blaulicht)

| Source | Format | URL | Notes |
|---|---|---|---|
| **Presseportal Blaulicht Trier** | RSS | `https://www.presseportal.de/rss/blaulicht/nr/117701.rss2` | Police/fire press releases. Best structured source. |
| **Polizei RLP Trier** | RSS | `polizei.rlp.de/service/pressemeldungen` | Official police reports |
| **Bundespolizei Trier** | RSS | `presseportal.de/blaulicht/nr/70138` | Federal police (border, rail) |
| **SWR Aktuell RLP** | RSS | `https://www.swr.de/~rss/swraktuell/swraktuell-rp-100.xml` | Public broadcaster, Trier bureau |
| **Volksfreund** | Web (scrape) | `https://www.volksfreund.de/` | Main regional newspaper. No confirmed public RSS. |
| **Lokalo.de** | Web | `https://lokalo.de/blaulicht/` | Regional Blaulicht aggregator |

---

## 11. Events & Dance

### General Event Calendars

| Source | Access | Notes |
|---|---|---|
| **trier-info.de** (Tourist Info) | Undocumented REST: `POST https://www.trier-info.de/en/rest_api/calendar` | Returns HTML fragments. Filter by date, type, category. No auth needed. |
| **RLP Tourismus DataHub** | REST API (JSON-LD): `https://data.rlp-tourismus.de/docs/api` | Best structured API! schema.org vocab. Request credentials from `weier@rlp-tourismus.de` |
| **trier.de Events** | Web: `https://www.trier.de/leben-in-trier/kultur-freizeit/heute-in-trier` | City CMS calendar. No API. |
| **TUFA Trier** | Web: `https://tufa-trier.de/en/veranstaltungskalender` | Cultural center events |
| **Eventbrite** | REST API (OAuth2): `eventbrite.com/platform/api` | `eventbrite.com/d/germany--trier/events/` |
| **Reservix** | API (login required): `developer.reservix.de` | 30K+ events/day. JSON + XML. |
| **GNTB Open Data** | `https://open-data-germany.org/en/` | German tourism Knowledge Graph. CC licensed. |

### Dance-Specific Sources

| Source | URL | Notes |
|---|---|---|
| **goandance.com** | `https://www.goandance.com/en/events` | Europe's largest Latin dance event platform. Lists **Treveris Dance Festival** (Apr 10-12, 2026, Europahalle Trier). No API. |
| **Franks Tanzschule** | `https://franks-tanzschule.de/de/termine` | Practice evenings (Fridays), Line Dance, Disco Fox, themed parties. HTML only. |
| **Tanzloft Trier (Zentz)** | `https://www.tanzloft-trier.de/events` | SBK parties (Salsa/Bachata/Kizomba), La Noche Latina, Szene-Tanzparty. Weekly schedule at `/stundenplan-kurse/stundenplan`. HTML only. |
| **Treveris Dance Festival** | `https://www.treveris-dance-festival.de/` | Major annual event. 60+ workshops, 50+ artists, 4 dance floors. |
| **salsavida.com** | `https://www.salsavida.com/guides/germany/` | Curated Latin dance festival list |
| **latindancecalendar.com** | `latindancecalendar.com` | Latin dance event listings |

---

## 12. Earthquake / Seismic Data (Eifel Volcanic Field)

The Laacher See volcano in the Eifel (~60km NE of Trier) is actively monitored with ongoing deep low-frequency earthquake activity observed since 2013.

| Source | Access | Notes |
|---|---|---|
| **GFZ GEOFON** | FDSN API: `https://geofon.gfz.de/waveform/webservices/fdsnws.php` | Real-time seismic waveforms. SeedLink at `geofon.gfz.de:18000`. Largest European archive. |
| **BGR GERSEIS** | WMS: `https://geoviewer.bgr.de` | German earthquake catalogue. 43,000+ events from year 800 to present. |
| **GRSN** | FDSN network | German Regional Seismic Network covering RLP |

---

## 13. Energy (Solar / Wind)

| Source | API | Notes |
|---|---|---|
| **SMARD** (Bundesnetzagentur) | OpenAPI: `https://smard.api.bund.dev/` | Electricity market data. Generation by source (solar, wind, etc.). CC BY 4.0. Amprion control zone covers RLP/Trier. |
| **Open Power System Data** | `https://open-power-system-data.org/` | European time-series energy data |

---

## 14. Satellite Imagery

| Source | Access | Notes |
|---|---|---|
| **Copernicus / Sentinel-2** | `https://dataspace.copernicus.eu/` | 10m optical, 5-day revisit. Free. NDVI for Mosel vineyards, flood detection. Browser at `browser.dataspace.copernicus.eu` |
| **Landsat** (USGS) | `https://earthexplorer.usgs.gov/` | 30m optical, 16-day revisit. Free. |
| **Google Photorealistic 3D Tiles** | Google Maps Platform API | The tech WorldView uses. Requires API key. |

---

## 15. GIS / Geodata Portals

| Source | Access | Notes |
|---|---|---|
| **Geoportal RLP** | WMS/WFS/OGC API: `https://www.geoportal.rlp.de/spatial-objects/` | State geodata: parcels, terrain, water network, protected areas |
| **Geoportal Trier** | WFS: `https://geoportal.trier.de/trier/` | City GIS: planning, environment, transport, waste. Mobility WFS: `geoportal.trier.de/trier/mod_ogc/wfs_getmap.php?mapfile=verkehr_mobilitaet` |
| **LVermGeo RLP** | Downloads: `https://lvermgeo.rlp.de/geodaten-geoshop/open-data` | Orthophotos, topo maps, building models, ALKIS. ~7TB free data. |
| **daten.rlp.de** | CKAN API: `https://daten.rlp.de/` | State open data portal |
| **Luxembourg Geoportal** | `https://www.geoportail.lu/en/` | Cross-border geodata |
| **Luxembourg Open Data** | `https://data.public.lu/en/` | Rich open data ecosystem |
| **OpenStreetMap / Overpass** | `https://overpass-turbo.eu/` | Query OSM data. Trier bbox: `[bbox:49.72,6.58,49.85,6.72]` |

---

## 16. Social & Community

| Source | Access | Notes |
|---|---|---|
| **Reddit r/trier** | JSON: `https://www.reddit.com/r/trier.json` | Small community |
| **Strava Metro Heatmap** | `https://labs.strava.com/heatmap/` | Cycling/pedestrian GPS traces. Great for Moselradweg. |

---

## Quick Reference: Top API Endpoints

```
# Weather (Trier)
GET https://api.brightsky.dev/weather?lat=49.75&lon=6.64&date=2026-03-04

# Mosel water level (Trier, live)
GET https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/TRIER%20UP/W

# Aircraft over Trier area
GET https://opensky-network.org/api/states/all?lamin=49.5&lomin=6.3&lamax=50.2&lomax=7.1

# Air quality (UBA)
GET https://luftdaten.umweltbundesamt.de/api/air-data/v4/

# Autobahn roadworks (A1)
GET https://verkehr.autobahn.de/o/autobahn/A1/services/roadworks

# VRT bus schedules (GTFS)
GET https://geoportal.vrn.de/services/sharing/rest/content/items/0acb30e1a008405bbb87c25045cfd0b7/data

# DB train departures (Trier Hbf, no auth)
GET https://v6.db.transport.rest/stops/8000373/departures

# Luxembourg A1 camera still
GET https://www.cita.lu/info_trafic/cameras/images/cccam_114.jpg

# Luxembourg A1 live video stream
GET https://live-edge.rtl.lu/cita/cita_a1/playlist.m3u8

# Trier webcam
GET http://webcam.bmrtrier.de/webcam/wetter.jpg

# Police Trier RSS
GET https://www.presseportal.de/rss/blaulicht/nr/117701.rss2

# Energy market (SMARD)
GET https://smard.api.bund.dev/

# Trier events (POST, returns HTML)
POST https://www.trier-info.de/en/rest_api/calendar

# VRT Bus real-time departures (EFA, no auth needed!)
GET https://mandanten.vrn.de/vrt2/XSLT_DM_REQUEST?outputFormat=JSON&type_dm=stopID&name_dm=17001318&useRealtime=1&itdLPxx_contractor=vrt&stateless=1&mode=direct

# VRT Stop finder
GET https://mandanten.vrn.de/vrt2/XSLT_STOPFINDER_REQUEST?outputFormat=JSON&type_sf=any&name_sf=Trier&itdLPxx_contractor=vrt

# Geoportal RLP - Trier bus stops (GeoJSON)
GET https://www.geoportal.rlp.de/spatial-objects/505/collections/ms:haltestellen/items?f=json

# Geoportal RLP - Trier playgrounds (GeoJSON)
GET https://www.geoportal.rlp.de/spatial-objects/636/collections/ms:spielplaetze/items?f=json

# Geoportal RLP - Trier public facilities (GeoJSON)
GET https://www.geoportal.rlp.de/spatial-objects/477/items?f=json

# UNESCO World Heritage sites RLP (GeoJSON)
GET https://daten.rlp.de/geodata/9ec4e052-ebd2-2c44-f258-25557de7a6b7

# Trier Hafen webcam
GET https://cam.hafen-trier.de/hafentrier.jpg

# Traben-Trarbach Mosel cam
GET https://www.moselcam.de/aktuell.jpg

# Cochem webcam
GET https://cochem.de/wp-content/uploads/webcam.jpg
```

---

## 17. More Creative / Niche Data Source Ideas

Ideas for additional data layers, from mainstream to very niche. Each marked with feasibility.

### Infrastructure & Urban

1. **Trier Stadtradeln / Bike counters** — Some German cities have automatic bike counting stations (Dauerzaehlstellen Radverkehr). Trier participates in Stadtradeln. Check if counting data is published. *Feasibility: Medium*

2. **E-Scooter positions** — Tier, Lime, or other scooter providers in Trier expose vehicle positions via their apps. GBFS (General Bikeshare Feed Specification) feeds are sometimes public. *Feasibility: Medium*

3. **EV charging station status** — Live availability of electric vehicle chargers. The Autobahn API has EV stations, and the Bundesnetzagentur Ladesaeulenregister lists all chargers. Open Charge Map API (`openchargemap.org/site/develop/api`) has real-time status. *Feasibility: High*

4. **Baustellen-Webcams** — Construction site webcams for major Trier projects. The Moselbruecke Schweich reconstruction likely has a project webcam. *Feasibility: Medium*

5. **Street lighting data** — Some smart cities publish streetlight status/outage data. Trier's KIM system may include this. *Feasibility: Low-Medium*

6. **Waste collection schedule** — SWT/A.R.T. (Abfallwirtschaft Region Trier) may have API-accessible pickup schedules. Many German waste companies have iCal feeds. *Feasibility: Medium*

### Nature & Environment

7. **Pollen count / allergy data** — DWD publishes pollen forecasts. Pollenflug-Gefahrenindex API at `opendata.dwd.de`. Relevant for the Mosel valley. *Feasibility: High*

8. **UV Index** — DWD UV index forecasts, relevant for outdoor activities. *Feasibility: High*

9. **Mosel water temperature** — Some gauges measure temperature alongside water level. Check Pegelonline for temperature-equipped stations. *Feasibility: Medium*

10. **Wildfire risk / Waldbrandgefahrenindex** — DWD publishes forest fire danger indices. The Eifel/Hunsrueck forests are monitored. *Feasibility: High*

11. **Light pollution / night sky data** — lightpollutionmap.info has data for the Eifel (one of Germany's few dark sky regions). The Sternenpark Eifel is near Trier. *Feasibility: High*

12. **Mosel vineyard phenology** — Sentinel-2 NDVI time series over Mosel vineyards. Track vine growth, harvest timing, frost damage. Wine region data from the Weinbauverband Mosel. *Feasibility: High*

13. **Bat/bird migration radar** — The DWD weather radar network can detect bird migration patterns. Operational radar at Neunkirchen covers the Trier area. BirdCast-style visualization. *Feasibility: Medium*

### Human Activity & Social

14. **Google Popular Times / live busyness** — Google Maps shows real-time busyness for businesses, restaurants, bars. Not an official API but extractable. Shows how busy the Hauptmarkt, Porta Nigra area, shopping streets are. *Feasibility: Medium*

15. **WiFi probe density / Hystreet pedestrian counts** — hystreet.com counts pedestrians in German shopping streets using laser sensors. Check if Trier's Simeonstrasse or Fleischstrasse is covered. *Feasibility: Medium*

16. **University lecture schedules** — Uni Trier and Hochschule Trier publish semester schedules. Could visualize student density patterns across campus. *Feasibility: Medium*

17. **Church bell schedules** — Trier's Dom and many churches ring bells on schedules. Map all church locations + bell times for a unique audio-spatial layer. *Feasibility: Fun/Niche*

18. **Weinlese (grape harvest) tracking** — The wine harvest in the Mosel valley is a major annual event. Track harvest progress via local news, wine association reports, Sentinel-2 vegetation changes. *Feasibility: Niche*

### Transport & Movement

19. **Taxi availability** — If Trier has ride-hailing (FreeNow/myTaxi), positions are visible in-app. *Feasibility: Low*

20. **Cargo train movements** — DB Cargo and private rail operators run freight through Trier. The OpenRailwayMap (openrailwaymap.org) has infrastructure; combine with DB GTFS for passenger trains, listen on rail frequencies. *Feasibility: Medium*

21. **Cross-border commuter traffic patterns** — ~50,000 daily commuters cross Luxembourg-Trier. CITA traffic flow data + VRT bus occupancy could visualize this. *Feasibility: Medium*

22. **Flixbus/long-distance bus departures** — Flixbus API or scraping. Trier Hbf is a stop. *Feasibility: Medium*

### Unusual / Creative

23. **Radiosondes / weather balloon tracking** — The DWD launches radiosondes from stations. SondeHub (sondehub.org) tracks them live via amateur radio. Balloons from Idar-Oberstein or other nearby stations may drift over Trier. *Feasibility: High (SondeHub API is free)*

24. **Amateur radio APRS** — aprs.fi shows real-time positions of amateur radio operators, weather stations, and mobile stations in the Trier area. *Feasibility: High*

25. **Geomagnetic field data** — GFZ Potsdam publishes real-time geomagnetic indices. Relevant for aurora visibility (rare but possible from Eifel). *Feasibility: Niche*

26. **Noise map (Laermkarte)** — EU Environmental Noise Directive requires noise mapping. RLP publishes strategic noise maps (Laermkartierung). Static but detailed. *Feasibility: High*

27. **Friedhof (cemetery) data** — Trier's historic cemeteries have GIS data. The Hauptfriedhof has notable graves. Niche but culturally interesting layer. *Feasibility: Niche*

28. **Historical aerial photos** — LVermGeo RLP has digitized historical orthophotos. Compare current Sentinel imagery with 1950s/60s/70s aerial photos. *Feasibility: High*

29. **Stolpersteine locations** — Trier has Stolpersteine (memorial brass plates for Holocaust victims). Could map them. Data may be on stolpersteine.eu. *Feasibility: Medium*

30. **Radio/TV transmitter signals** — The Sender Trier-Petrisberg transmits various FM/DAB/DVB-T signals. FMSCAN.org has transmitter databases. *Feasibility: Niche*

---

## 18. Geoportal RLP — Trier Thematic OGC APIs

The Geoportal RLP hosts dedicated OGC API Features endpoints with rich point-of-interest data specifically for the city of Trier. All endpoints return **GeoJSON** (`?f=json`) or **XML** (`?f=xml`), require no authentication, and are licensed under **Datenlizenz Deutschland Namensnennung 2.0**.

| Theme | Endpoint ID | Layers (collections) |
|---|---|---|
| **Traffic & Mobility** | [/spatial-objects/505](https://www.geoportal.rlp.de/spatial-objects/505) | 18 layers: bus stops, train stations, EV charging (car+bike), parking garages, P+R, carsharing, taxi stands, bike garages, motorcycle parking, RV parking, disabled parking, parking meters |
| **Public Facilities** | [/spatial-objects/477](https://www.geoportal.rlp.de/spatial-objects/477) | 25 layers: hospitals, police, fire/disaster protection, churches (catholic/protestant/other), cemeteries, youth centers, senior homes, social services, health department, waste collection points, clothing bins, emergency centers |
| **Leisure & Recreation** | [/spatial-objects/636](https://www.geoportal.rlp.de/spatial-objects/636) | 9 layers: playgrounds, excursion destinations, bike rental, pools, indoor/outdoor activities, educational trails, parks |
| **Cool Places (Kühle Orte)** | [/spatial-objects/638](https://www.geoportal.rlp.de/spatial-objects/638) | 13 layers: shaded parks, fountains, drinking water, churches, cultural buildings, benches — urban heat adaptation |
| **Monuments & Heritage** | [/spatial-objects/644](https://www.geoportal.rlp.de/spatial-objects/644) | Monument zones, individual monuments, excavation protection zones (Grabungsschutzgebiete) |
| **Road Noise Mapping** | [/spatial-objects/645](https://www.geoportal.rlp.de/spatial-objects/645) | Daytime/nighttime road noise levels in dB(A), noise boundary lines |
| **Schools & Education** | [/spatial-objects/482](https://www.geoportal.rlp.de/spatial-objects/482) | Schools, academies, universities |
| **Culture** | [/spatial-objects/488](https://www.geoportal.rlp.de/spatial-objects/488) | Libraries, galleries, museums, theatres |
| **District Boundaries** | [/spatial-objects/466](https://www.geoportal.rlp.de/spatial-objects/466), [/467](https://www.geoportal.rlp.de/spatial-objects/467) | Ortsbezirke and Stadtbezirke polygons |
| **Development Areas** | [/spatial-objects/500](https://www.geoportal.rlp.de/spatial-objects/500) | Entwicklungsgebiete |

**Usage:**
```
# Get all bus stops as GeoJSON
GET https://www.geoportal.rlp.de/spatial-objects/505/collections/ms:haltestellen/items?f=json

# Get all playgrounds
GET https://www.geoportal.rlp.de/spatial-objects/636/collections/ms:spielplaetze/items?f=json

# API definition (OpenAPI)
GET https://www.geoportal.rlp.de/spatial-objects/505/api
```

---

## 19. Geoportal Trier — 3D City Model

**2D Portal:** `https://geoportal.trier.de/trier/index.php` — 250+ datasets covering leisure, environment, transport, urban planning

**3D City Model:** `https://www.trier.de/leben-in-trier/stadtportrait/geoinformationen/geoportal-3d`

| Feature | Details |
|---|---|
| Buildings | 100,000+ buildings with roof geometry (LoD2-equivalent) |
| Trees | 3D tree cadastre integrated |
| Terrain | Digital terrain model with aerial photo textures |
| Surface | New photogrammetric surface model from spring 2025 (cooperation with SWT) |
| Aerial Imagery | 2025 orthophotos available |

The 3D model is viewer-only on the city portal. For downloadable **CityGML LoD2** data covering all of RLP (including Trier), use the LVermGeo state data:
- ATOM feed: `https://open.rlp.de/de/suchergebnisse/dataset/3d-gebaudemodell-lod2-rp`
- Also via GeoShop: `https://geoshop.rlp.de`

**WMS/WFS services** are provided OGC-compliant for integration into external GIS systems, no permit required.

**Contact:** Amt für Bodenmanagement und Geoinformation — `Bodenmanagement@trier.de` / 0651-718-1620

---

## 20. Census & Demographics (Zensus 2022)

| Source | Access | Notes |
|---|---|---|
| **Zensusdatenbank** | Web + API: `https://ergebnisse.zensus2022.de/datenbank/online/` | Population, buildings, dwellings, households, education, employment for Trier (municipality level) |
| **Grid data (100m / 1km)** | CSV download: `https://ergebnisse.zensus2022.de/` | Georeferenced population + building data at 100m and 1km grid resolution |
| **R package `z22`** | `install.packages("z22")` | Programmatic access to Zensus 2022 grid data |

**Trier in Zahlen** (city statistics): `https://www.trier.de/rathaus-buerger-in/trier-in-zahlen/`
- Stadt-Fokus (multi-annual thematic publication)
- Arbeitsmarkt (unemployment key figures)
- Bevölkerungsstruktur (population demographics)
- Bautätigkeit (construction activity)
- KFZ-Bestandsdaten (vehicle registrations)
- Stadt im Blick (launched 2025, analysis + recommendations)
- **Format:** Primarily PDF reports. Contact `statistik@trier.de` for raw data.

---

## 21. Elections

| Level | Source | Format | Notes |
|---|---|---|---|
| **Bundestag** | [Bundeswahlleiterin](https://www.bundeswahlleiterin.de/bundestagswahlen/2025/ergebnisse/opendata.html) | CSV, XML | Trier = **Wahlkreis 202**. Results at Wahlkreis + polling station level. |
| **Landtag RLP** | [wahlen.rlp.de](https://www.wahlen.rlp.de/) | Various | State election results |
| **Kommunalwahlen** | [trier.de/wahlen/archiv](https://www.trier.de/rathaus-buerger-in/wahlen/archiv/) | PDF/HTML | City council, Ortsbeirat results. Historical archive. |

---

## 22. Land Values & Urban Planning

| Source | Access | Notes |
|---|---|---|
| **Bodenrichtwerte Trier** | WMS: via [open.rlp.de](https://open.rlp.de/de/suchergebnisse/dataset/bodenrichtwerte-trier) | Land values as of Jan 2024, classified by use type. **CC Zero** license. |
| **BORIS RLP** | Web: `https://www.boris.rlp.de/` | Interactive land value viewer for all of RLP |
| **Landschaftsplan Trier** | WMS: via open.rlp.de | Landscape plans (Nord, Süd, West/Pallien, Mitte/Gartenfeld). From 2020. Points, lines, areas. |
| **Stadtkataster Trier** | WMS/WFS/OGC API: via open.rlp.de | Archaeological protection zones, monument zones. Published by GDKE (Generaldirektion Kulturelles Erbe). |
| **Solardachkataster** | Viewer: `https://www.solardachkataster-trier.de/` | ~75% of rooftops assessed for solar suitability. Updated 2021. No public API. |
| **Solarkataster RLP** | Viewer: `https://solarkataster.rlp.de/` | State-level Energieatlas with solar potential data |

---

## 23. UNESCO World Heritage & Tourism

| Source | Access | Notes |
|---|---|---|
| **UNESCO Welterbestätten RLP** | OGC API: `https://daten.rlp.de/geodata/9ec4e052-ebd2-2c44-f258-25557de7a6b7` | POIs for UNESCO sites including Trier's Roman monuments (Porta Nigra, Kaiserthermen, Amphitheater, etc.). GeoJSON. |
| **RLP Tourismus DataHub** | REST API (JSON-LD): `https://data.rlp-tourismus.de/docs/api` | schema.org vocabulary. Credentials via `weier@rlp-tourismus.de` |
| **GNTB Open Data** | `https://open-data-germany.org/en/` | German tourism Knowledge Graph. CC licensed. |

---

## 24. Trier-Saarburg District (Surrounding Landkreis)

**Bürger-GIS:** `https://www.trier-saarburg-buergergis.de/`

Covers the surrounding rural district (not city of Trier itself):
- Property/parcel maps
- Nature conservation areas
- Kindergarten locations
- Bodenrichtwerte (land values)
- Solar cadastre
- Tourism POIs

WMS/WFS services accessible for GIS users through the portal.
