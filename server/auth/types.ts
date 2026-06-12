import "server-only";

/**
 * Auth session types — full implementation in Phase 2.
 */

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
};

export type AppSession = {
  user: SessionUser;
};
