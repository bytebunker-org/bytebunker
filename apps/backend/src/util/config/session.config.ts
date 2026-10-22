import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

enum CookieSameSite {
    NONE = 'none',
    LAX = 'lax',
    STRICT = 'strict',
}

export class SessionConfig {
    @IsString()
    @IsNotEmpty()
    public readonly secret!: string;

    @IsOptional()
    @IsString()
    public readonly cookieDomain!: string;

    /**
     * Session cookie name, `sid` by default. Cookies ignore ports, so each dev instance on one host
     * (main checkout and every git worktree) needs its own name or they log each other out.
     */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    public readonly cookieName?: string;

    @IsNumber()
    @IsInt()
    @IsPositive()
    public readonly cookieMaxAge!: number;

    @IsEnum(CookieSameSite)
    public readonly cookieSameSite!: CookieSameSite;
}
