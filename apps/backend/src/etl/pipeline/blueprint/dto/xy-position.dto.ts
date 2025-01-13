import { IsInt } from 'class-validator';

export class XyPositionDto {
    @IsInt()
    public x!: number;

    @IsInt()
    public y!: number;
}
