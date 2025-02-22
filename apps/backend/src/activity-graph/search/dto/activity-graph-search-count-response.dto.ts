import { IsArray } from 'class-validator';

export class ActivityGraphSearchCountResponseDto {
    @IsArray()
    public groupedCount!: {
        date: string;
        count: number;
    }[];
}
