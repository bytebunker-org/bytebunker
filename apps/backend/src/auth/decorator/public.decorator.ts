import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_DECORATOR_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_DECORATOR_KEY, true);
