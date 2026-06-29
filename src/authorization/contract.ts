/**
 * Authorization contract. Answers: "Can this principal perform this action on
 * this resource?"
 *
 * Every mutating admin API route consults the {@link AuthorizationProvider}.
 * Ships `none`/`roles`/`delegated` implementations.
 *
 * @module
 */

import type { Principal } from "../auth/contract.ts";

/** The full set of authorizable actions. */
export type FlagsAction =
  | "project:read"
  | "project:create"
  | "project:update"
  | "project:delete"
  | "environment:read"
  | "environment:create"
  | "environment:update"
  | "environment:delete"
  | "flag:read"
  | "flag:create"
  | "flag:update"
  | "flag:delete"
  | "snapshot:read"
  | "snapshot:publish"
  | "snapshot:rollback"
  | "audit:read";

/** The resource an action targets. */
export type FlagsResource =
  | { type: "project"; projectKey: string }
  | { type: "environment"; projectKey: string; environmentKey: string }
  | { type: "flag"; projectKey: string; environmentKey: string; flagKey: string }
  | { type: "snapshot"; projectKey: string; environmentKey: string; version?: string }
  | { type: "audit"; projectKey: string; environmentKey?: string };

/** Input passed to {@link AuthorizationProvider.authorize}. */
export interface AuthorizeInput {
  principal: Principal | null;
  action: FlagsAction;
  resource: FlagsResource;
  request: Request;
}

/** Decides whether an action is permitted. */
export interface AuthorizationProvider {
  authorize(input: AuthorizeInput): Promise<boolean>;
}

/** Actions that mutate state — blocked in readonly mode. */
export const MUTATING_ACTIONS: ReadonlySet<FlagsAction> = new Set<FlagsAction>([
  "project:create",
  "project:update",
  "project:delete",
  "environment:create",
  "environment:update",
  "environment:delete",
  "flag:create",
  "flag:update",
  "flag:delete",
  "snapshot:publish",
  "snapshot:rollback",
]);

/** True if the action mutates state. */
export const isMutatingAction = (action: FlagsAction): boolean => MUTATING_ACTIONS.has(action);
