import type { Owner, User } from "../shared/domain";
export interface AuthUser {
  id: Owner;
  name: string;
  email: string;
  salt: string;
  hash: string;
  iterations: number;
}
export interface Bindings {
  DB: D1Database;
  EVIDENCE: R2Bucket;
  ASSETS: Fetcher;
  AUTH_USERS_JSON: string;
  SESSION_SECRET: string;
  APP_ORIGIN: string;
  LOCAL_DEV?: string;
}
export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    user: User;
    users: AuthUser[];
    tokenHash: string;
    fingerprint: string;
    requestId: string;
  };
};
