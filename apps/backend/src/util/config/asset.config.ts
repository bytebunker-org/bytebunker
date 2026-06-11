import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class AssetConfig {
    @IsString()
    @IsNotEmpty()
    public readonly endPoint!: string;

    @IsOptional()
    @IsString()
    public readonly region?: string;

    @IsInt()
    @Min(1)
    @Max(65_536)
    public readonly port!: number;

    @IsBoolean()
    public readonly useSSL!: boolean;

    @IsString()
    @IsNotEmpty()
    public readonly accessKey!: string;

    @IsString()
    @IsNotEmpty()
    public readonly secretKey!: string;

    // Optional: when unset/empty, getPublicUrl falls back to a domain-relative URL
    // (e.g. served behind the same proxy). Set it to the public asset base when assets
    // are served from a different origin.
    @IsOptional()
    @IsString()
    public readonly publicBaseUrl?: string;
}
