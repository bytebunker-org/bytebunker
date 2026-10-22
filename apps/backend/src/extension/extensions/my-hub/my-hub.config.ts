import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

/**
 * Connection to my-hub (`myHub:` in env.yml or `MY_HUB__BASE_URL`, `MY_HUB__TOKEN`, … as environment variables).
 * Optional: without it the my-hub modules fail with a clear message instead of the backend refusing to start.
 * The client only ever sends GET requests.
 */
export class MyHubConfig {
    /** Backend base URL, e.g. `http://localhost:11000`. */
    @IsUrl({ require_tld: false, require_protocol: true })
    public readonly baseUrl!: string;

    /** my-hub API key (its `apiKey` config), sent as `Authorization: Bearer`. Keep it out of the repository. */
    @IsString()
    @IsNotEmpty()
    public readonly token!: string;

    /** Cloudflare Access service token, when my-hub sits behind Cloudflare Access. */
    @IsOptional()
    @IsString()
    public readonly cfAccessClientId?: string;

    @IsOptional()
    @IsString()
    public readonly cfAccessClientSecret?: string;
}
