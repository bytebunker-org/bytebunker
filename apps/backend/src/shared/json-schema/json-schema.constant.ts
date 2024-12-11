export const PARALO_SCHEMA_HOST = 'schema.paralo.de';
export const PARALO_SCHEMA_ORIGIN = 'https://schema.paralo.de/';
export const SCHEMA_FILE_EXTENSION = '.schema.json';

/**
 * A schema path has to contain at least one subdirectory, a schema name and then end in .schema.json.
 * Also, all path parts and the filename have to contain only a-z and dashes.
 */
export const SCHEMA_PATH_REGEX = /^(?:\/[a-z-]+){2,}\.schema\.json$/;
export const SCHEMA_PARTIAL_PATH_REGEX = /^\/(?:[a-z-]+\/)+(?:[a-z-]+\.schema\.json)?$/;
