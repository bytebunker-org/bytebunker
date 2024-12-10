import { Allow } from 'class-validator';

export class CorsConfig {
    @Allow()
    public readonly endpoint!: boolean | string | RegExp | (string | RegExp)[];
}
