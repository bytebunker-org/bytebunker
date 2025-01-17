import { EXTENSION_NAME_LENGTH } from '../../../extension/extension.constant.js';

export const PIPELINE_MODULE_SCHEMA_BASE_URL = 'https://schema.bytebunker.dev/pipeline-module';
export { NIL as PIPELINE_MODULE_CORE_EXTENSION_ID } from 'uuid';
export const PIPELINE_MODULE_CORE_EXTENSION_NAME = 'core';
export const PIPELINE_MODULE_CLASS_NAME_REGEX = /([A-Z][A-Za-z]+PipelineModule(V\d+)?)/;

export const PIPELINE_MODULE_NAME_LENGTH = 64;
export const PIPELINE_MODULE_VERSION_LENGTH = '65535'.length;
export const PIPELINE_MODULE_IDENTIFIER_LENGTH =
    EXTENSION_NAME_LENGTH + 1 + PIPELINE_MODULE_NAME_LENGTH + 1 + PIPELINE_MODULE_VERSION_LENGTH;

export const PIPELINE_MODULE_IDENTIFIER_REGEX = new RegExp(
    `^([a-z-]{1,${EXTENSION_NAME_LENGTH}}):([a-z-]{1,${PIPELINE_MODULE_NAME_LENGTH}})@([1-9]\\d{0,${PIPELINE_MODULE_VERSION_LENGTH - 1}})$`,
);
