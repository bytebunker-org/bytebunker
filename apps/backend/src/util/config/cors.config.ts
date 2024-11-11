import { tags } from 'typia';

export class CorsConfig {
    public readonly endpoint!:
        | boolean
        | (string & tags.MinLength<1>)
        | RegExp
        | ((string & tags.MinLength<1>) | RegExp)[];
}
