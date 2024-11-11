import { UserDto } from '../../user/dto/user.dto.js';

declare global {
    namespace Express {
        // eslint-disable-next-line @typescript-eslint/no-empty-interface
        interface User extends UserDto {}
    }
}

declare module 'express-session' {
    interface SessionData {
        id: number;
        username: string;
        password: string;
        createdAt: Date;
        updatedAt: Date;
    }
}
