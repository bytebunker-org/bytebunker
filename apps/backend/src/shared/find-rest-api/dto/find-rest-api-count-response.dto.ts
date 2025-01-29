import { IsInt, Min } from 'class-validator';

export class FindRestApiCountResponseDto {
    @IsInt()
    @Min(0)
    public count!: number;
}
