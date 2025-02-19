import type { FactoryProvider } from '@nestjs/common';
import { NEODE_PROVIDER } from './neode.constant.js';
import { Neode, type NeodeOptions } from '@bytebunker/neode';
import { Neo4jConfig } from '../../util/config/neo4j.config.js';
import { registerGraphSchemas } from '../schema/graph-schema.constant.js';

export function buildNeodeOptions(config: Neo4jConfig): NeodeOptions {
    return {
        connectionString: config.connectionString,
        username: config.username,
        password: config.password,
        enterprise: config.isEnterprise ?? false,
        database: config.database,
        logging: config.logging,
    };
}

export const neodeProvider: FactoryProvider = {
    provide: NEODE_PROVIDER,
    useFactory: (config: Neo4jConfig) => {
        const neode = new Neode(buildNeodeOptions(config));
        registerGraphSchemas(neode);

        return neode;
    },
    inject: [Neo4jConfig],
};
