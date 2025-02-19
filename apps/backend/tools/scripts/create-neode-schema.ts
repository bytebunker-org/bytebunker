import { selectConfig, TypedConfigModule } from 'nest-typed-config';
import { buildTypedConfigModuleOptions } from '../../src/util/config/config.util.js';
import { AppConfig } from '../../src/util/config/app.config.js';
import { Neo4jConfig } from '../../src/util/config/neo4j.config.js';
import { Neode, Schema } from '@bytebunker/neode';
import { buildNeodeOptions } from '../../src/activity-graph/graph-database/neode.provider.js';
import { registerGraphSchemas } from '../../src/activity-graph/schema/graph-schema.constant.js';

const basename = process.env['NEODE_MIGRATION'] ? '.env.migration' : undefined;

export const ConfigModule = TypedConfigModule.forRoot(buildTypedConfigModuleOptions(AppConfig, basename));

export const config = selectConfig(ConfigModule, Neo4jConfig);

async function main() {
    const neode = new Neode(buildNeodeOptions(config));
    registerGraphSchemas(neode);

    try {
        const schema = new Schema(neode);

        console.log('Installing neode schema...');
        await schema.install();
        console.log('Done');
    } finally {
        await neode.close();
    }
}

main().catch((error) => {
    console.error(error);
});
