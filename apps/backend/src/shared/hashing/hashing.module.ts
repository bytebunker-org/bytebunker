import { Module } from '@nestjs/common';
import { BcryptService } from './bcrypt.service.js';

@Module({
    providers: [BcryptService],
    exports: [BcryptService],
})
export class HashingModule {}
