import { tags } from 'typia';

export class RedisConfig {
    public readonly host!: string & tags.MinLength<1>;

    public readonly port!: number & tags.Type<'uint32'> & tags.Minimum<1> & tags.Maximum<65_536>;

    public readonly username?: string;

    public readonly password?: string;
}
