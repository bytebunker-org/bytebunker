export type { Records, LocationRecord } from './type/location-history-records.type.js';
export type {
    SemanticLocationHistory,
    TimelineObject,
    ActivitySegment,
    PlaceVisit,
    Location,
    SimplifiedRawPath,
    WaypointPath,
} from './type/location-history-semantic.type.js';
export { SpecificSemanticTypeEnum, ActivityTypeEnum } from './type/location-history-semantic.type.js';
export type { Settings } from './type/location-history-settings.type.js';
export type { TimelineEditsSchema, TimelineEditInformation } from './type/location-history-timeline-edits.type.js';
export type {
    LocationHistoryTimeline,
    SemanticSegment,
    SemanticSegments,
    TimelinePath,
    TimelinePathPoint,
    Visit,
    VisitCandidate,
    VisitSemanticType,
    Activity,
    ActivityCandidate,
    ActivityType,
    ParkingEvent,
    TimelineMemory,
    Trip,
    TripDestination,
    LatLngWrapper,
    GeoCoordinateString,
    ISO8601Timestamp,
    RawSignal,
    RawSignals,
    Position,
    PositionSource,
    ActivityRecord,
    ProbableActivity,
    ProbableActivityType,
    WiFiScan,
    WiFiDeviceRecord,
    UserLocationProfile,
    FrequentPlace,
    FrequentPlaceLabel,
    FrequentTrip,
    ModeShare,
    Persona,
    ModeAffinity,
    CommuteDirection,
} from './type/location-history-timeline.type.js';
export * from './type/place-confidence.enum.js';

export { default as RecordsJsonSchema } from './schema/Records.schema.json' with { type: 'json' };
export { default as SemanticJsonSchema } from './schema/Semantic.schema.json' with { type: 'json' };
export { default as SettingsJsonSchema } from './schema/Settings.schema.json' with { type: 'json' };
export { default as TimelineEditsJsonSchema } from './schema/TimelineEdits.schema.json' with { type: 'json' };
export { default as TimelineJsonSchema } from './schema/Timeline.schema.json' with { type: 'json' };
