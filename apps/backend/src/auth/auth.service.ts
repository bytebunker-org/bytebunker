import { Injectable } from '@nestjs/common';
import { BcryptService } from '../shared/hashing/bcrypt.service.js';
import type { UserSessionDto } from '../user/dto/user-session.dto.js';
import type { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
    constructor(
        private readonly bcryptService: BcryptService,
        //private readonly userService: UserService,
    ) {}

    /**
     * Validate a user login
     * @return the logged-in user object
     */
    private async validateUser({ username, password }: LoginDto): Promise<UserSessionDto> {
        /*const userData = await this.userService.findByUsernameForAuthentication(username);

        if (!userData) {
            throw new UnauthorizedException("User doesn't exist");
        }

        const isPasswordValid = await this.bcryptService.compare(password!, userData.password!);

        if (!isPasswordValid) {
            throw new UnauthorizedException('Password not valid');
        }

        delete userData.password;

        return {
            ...userData,
        };*/
        return {} as any;
    }
}
