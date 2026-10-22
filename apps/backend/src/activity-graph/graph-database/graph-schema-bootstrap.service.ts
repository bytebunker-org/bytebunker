import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Neode } from '@bytebunker/neode';
import { toSnakeCase } from 'js-convert-case';
import { NEODE_PROVIDER } from './neode.constant.js';

/**
 * Installs the constraints/indexes derived from the registered neode models.
 *
 * The neode fork's own `schema.install()` cannot be used because it emits plain
 * `CREATE CONSTRAINT`/`CREATE INDEX` statements without `IF NOT EXISTS`, so it can only ever run
 * against an empty database. This service emits idempotent statements with deterministic names
 * instead, so it can run on every boot.
 */
@Injectable()
export class GraphSchemaBootstrapService implements OnModuleInit {
    private readonly logger = new Logger(GraphSchemaBootstrapService.name);

    constructor(@Inject(NEODE_PROVIDER) private readonly neode: Neode) {}

    public async onModuleInit(): Promise<void> {
        try {
            await this.installSchema();
        } catch (error) {
            // A missing index must never keep the application from booting.
            this.logger.error('Failed to install the graph database schema', error);
        }
    }

    public async installSchema(): Promise<{ executed: number; skipped: number }> {
        const statements = this.buildStatements();

        let executed = 0;
        let skipped = 0;

        for (const statement of statements) {
            try {
                await this.neode.writeCypher(statement);
                executed++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);

                // Neo4j only treats `IF NOT EXISTS` as a no-op for an identical name *or* an
                // identical schema. An equivalent constraint/index created under a different name
                // (e.g. an auto generated `constraint_6f1ee8be`) is therefore fine to ignore.
                if (/already exists|equivalent/i.test(message)) {
                    this.logger.debug(`Skipping "${statement}": ${message}`);
                    skipped++;
                } else {
                    this.logger.warn(`Failed to run "${statement}": ${message}`);
                    skipped++;
                }
            }
        }

        this.logger.log(
            `Graph database schema installed (${executed}/${statements.length} statements executed, ${skipped} skipped).`,
        );

        return { executed, skipped };
    }

    private buildStatements(): string[] {
        const statements: string[] = [];

        for (const [label, model] of this.neode.models.entries()) {
            for (const property of model.properties.values()) {
                const name = `${toSnakeCase(label)}_${toSnakeCase(property.name)}`;

                if (property.primary || property.unique) {
                    statements.push(
                        `CREATE CONSTRAINT ${escapeIdentifier(`${name}_unique`)} IF NOT EXISTS ` +
                            `FOR (n:${escapeIdentifier(label)}) REQUIRE n.${escapeIdentifier(property.name)} IS UNIQUE`,
                    );
                }

                // `REQUIRE ... IS NOT NULL` is an enterprise only feature, so it is skipped here.

                if (property.indexed && !property.primary && !property.unique) {
                    statements.push(
                        `CREATE INDEX ${escapeIdentifier(`${name}_index`)} IF NOT EXISTS ` +
                            `FOR (n:${escapeIdentifier(label)}) ON (n.${escapeIdentifier(property.name)})`,
                    );
                }
            }
        }

        return statements;
    }
}

function escapeIdentifier(identifier: string): string {
    return `\`${identifier.replaceAll('`', '``')}\``;
}
