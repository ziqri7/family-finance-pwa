import type { Owner, User } from "../shared/domain";
import type { Database } from "./db/postgres";
import type { EvidenceStorage, StorageConfig } from "./storage";
export interface AuthUser {
  id: Owner;
  name: string;
  email: string;
  salt: string;
  hash: string;
  iterations: number;
}
export interface Bindings extends StorageConfig {
  DATABASE_URL: string;
  ASSETS: Fetcher;
  AUTH_USERS_JSON: string;
  SESSION_SECRET: string;
  PASSWORD_PEPPER: string;
  APP_ORIGIN: string;
  LOCAL_DEV?: string;
}
export interface RuntimeBindings extends Bindings {
  DB: Database;
  EVIDENCE: EvidenceStorage;
}
export type AppEnv = {
  Bindings: RuntimeBindings;
  Variables: {
    user: User;
    users: AuthUser[];
    tokenHash: string;
    fingerprint: string;
    requestId: string;
  };
};
