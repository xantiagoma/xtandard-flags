/**
 * Authorization contract. Answers: "Can this principal perform this action on
 * this resource?"
 *
 * Every mutating admin API route consults the {@link AuthorizationProvider}.
 * Ships `none`/`roles`/`delegated` implementations.
 *
 * @module
 */

import {
  defineActions,
  type AuthorizationProvider as KitAuthorizationProvider,
  type AuthorizeInput as KitAuthorizeInput,
} from "@xtandard/kit/authorization";

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
  | "snapshot:delete"
  | "audit:read";

/** The resource an action targets. */
export type FlagsResource =
  | { type: "project"; projectKey: string }
  | { type: "environment"; projectKey: string; environmentKey: string }
  | { type: "flag"; projectKey: string; environmentKey: string; flagKey: string }
  | { type: "snapshot"; projectKey: string; environmentKey: string; version?: string }
  | { type: "audit"; projectKey: string; environmentKey?: string };

/** Input passed to {@link AuthorizationProvider.authorize}. */
export type AuthorizeInput = KitAuthorizeInput<FlagsAction, FlagsResource>;

/** Decides whether an action is permitted. */
export type AuthorizationProvider = KitAuthorizationProvider<FlagsAction, FlagsResource>;

/** The flags action lists (`@xtandard/kit/authorization` `defineActions`). */
export const FLAGS_ACTIONS = defineActions<FlagsAction>({
  all: [
    "project:read",
    "project:create",
    "project:update",
    "project:delete",
    "environment:read",
    "environment:create",
    "environment:update",
    "environment:delete",
    "flag:read",
    "flag:create",
    "flag:update",
    "flag:delete",
    "snapshot:read",
    "snapshot:publish",
    "snapshot:rollback",
    "snapshot:delete",
    "audit:read",
  ],
  mutating: [
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
    "snapshot:delete",
  ],
});

/** Actions that mutate state — blocked in readonly mode. */
export const MUTATING_ACTIONS: ReadonlySet<FlagsAction> = FLAGS_ACTIONS.MUTATING_ACTIONS;

/** True if the action mutates state. */
export const isMutatingAction = (action: FlagsAction): boolean =>
  FLAGS_ACTIONS.isMutatingAction(action);
