/**
 * Delegated {@link AuthorizationProvider}. Wraps a caller-supplied `authorize`
 * function so you can implement any policy — ABAC, an external policy engine
 * (OPA, Cedar), per-project ownership checks — without implementing the
 * interface by hand.
 *
 * The wrapper normalizes a synchronous-or-asynchronous decision into the
 * `Promise<boolean>` the contract requires.
 *
 * @module
 */

import type { AuthorizationProvider, AuthorizeInput } from "./contract.ts";

/** Options for {@link delegatedAuthorization}. */
export interface DelegatedAuthorizationOptions {
  /**
   * Decide whether the {@link AuthorizeInput} is permitted. Return `true` to
   * allow. May be synchronous or asynchronous.
   */
  authorize: (input: AuthorizeInput) => Promise<boolean> | boolean;
}

/**
 * Create an {@link AuthorizationProvider} from a plain decision function.
 *
 * @example
 * ```ts
 * import { delegatedAuthorization } from "@xtandard/flags/authorization/delegated";
 *
 * const authz = delegatedAuthorization({
 *   authorize: ({ principal, action, resource }) =>
 *     principal?.metadata?.ownedProjects?.includes(resource.projectKey) ?? false,
 * });
 * ```
 */
export function delegatedAuthorization(
  options: DelegatedAuthorizationOptions,
): AuthorizationProvider {
  return {
    async authorize(input: AuthorizeInput): Promise<boolean> {
      return await options.authorize(input);
    },
  };
}
