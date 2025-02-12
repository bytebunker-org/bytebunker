import type { JSONSchema7 } from 'json-schema';

declare module 'schema-org-json-schemas' {
    const schemaOrgJsonSchemas: Record<string, JSONSchema7>;
    export default schemaOrgJsonSchemas;
}
