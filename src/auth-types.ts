import type { PublicUser } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: PublicUser;
    sessionId?: string;
  }
}
