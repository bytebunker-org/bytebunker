import { tags } from 'typia';
import { Allow } from 'class-validator';

enum TypeOrmLogLevel {
    QUERY = 'query',
    SCHEMA = 'schema',
    ERROR = 'error',
    WARN = 'warn',
    INFO = 'info',
    LOG = 'log',
    MIGRATION = 'migration',
}

export class MikroOrmConfig {
    public readonly host!: string;

    public readonly port!: number & tags.Minimum<1> & tags.Maximum<65_535>;

    public readonly user!: string & tags.MinLength<1>;

    public readonly password!: string & tags.MinLength<1>;

    public readonly database!: string & tags.MinLength<1>;

    public readonly logging!: TypeOrmLogLevel[];

    public readonly entities!: string[] & tags.MinItems<1>;

    public readonly entitiesTs!: string[] & tags.MinItems<1>;
}
