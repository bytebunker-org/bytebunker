import RecordsSchema from './LocationHistoryFormat/schemas/Records.schema.json';
import SettingsSchema from './LocationHistoryFormat/schemas/Settings.schema.json';
import SemanticSchema from './LocationHistoryFormat/schemas/Semantic.schema.json';
import TimelineEditsSchema from './LocationHistoryFormat/schemas/TimelineEdits.schema.json';

export const googleLocationHistorySchemas: Record<string, unknown> = {
    LocationHistoryRecords: RecordsSchema,
    LocationHistorySettings: SettingsSchema,
    LocationHistorySemantic: SemanticSchema,
    LocationHistoryTimelineEdits: TimelineEditsSchema,
};
