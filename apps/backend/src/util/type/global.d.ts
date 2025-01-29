import { UserDto } from '../../user/dto/user.dto.js';
import type { SerializedUserDto } from '../../auth/dto/serialized-user.dto.js';

declare global {
    namespace Express {
        // eslint-disable-next-line @typescript-eslint/no-empty-interface
        interface User extends UserDto {}
    }
}

declare module 'express-session' {
    interface SessionData {
        passport?: { user?: SerializedUserDto };
    }
}
