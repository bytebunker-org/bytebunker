import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

enum CookieSameSite {
    NONE = 'none',
    LAX = 'lax',
    STRICT = 'strict'
}

export class SessionConfig {
    @IsString()
    @IsNotEmpty()
    public readonly secret!: string;

    @IsOptional()
    @IsString()
    public readonly cookieDomain!: string;

    @IsNumber()
    @IsInt()
    @IsPositive()
    public readonly cookieMaxAge!: number;

    @IsEnum(CookieSameSite)
    public readonly cookieSameSite!: CookieSameSite;
}
