import { tags } from 'typia';

export interface LoginDto {
    username: string;

    password: string & tags.MinLength<12> & tags.MaxLength<256>;
}
