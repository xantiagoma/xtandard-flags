import { expectTypeOf, test } from "vitest";
import { evaluateFlag, type FlagEvaluation } from "../src/evaluator.ts";
import type {
  AuthProvider,
  AuthorizationProvider,
  Flag,
  FlagsStorage,
  FlagValue,
} from "../src/index.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { basicAuth } from "../src/auth/basic.ts";
import { rolesAuthorization } from "../src/authorization/roles.ts";

// These assertions are verified at compile time by `tsc --noEmit`.

test("evaluateFlag returns a FlagEvaluation", () => {
  const flag = {} as Flag;
  expectTypeOf(evaluateFlag(flag, {})).toEqualTypeOf<FlagEvaluation>();
});

test("a FlagEvaluation value is FlagValue | undefined", () => {
  expectTypeOf<FlagEvaluation["value"]>().toEqualTypeOf<FlagValue | undefined>();
});

test("memory storage satisfies FlagsStorage", () => {
  expectTypeOf(createMemoryStorage()).toMatchTypeOf<FlagsStorage>();
});

test("basicAuth satisfies AuthProvider", () => {
  expectTypeOf(basicAuth({ users: [] })).toMatchTypeOf<AuthProvider>();
});

test("rolesAuthorization satisfies AuthorizationProvider", () => {
  expectTypeOf(rolesAuthorization({})).toMatchTypeOf<AuthorizationProvider>();
});

test("a custom object can satisfy FlagsStorage", () => {
  const custom = {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
    getKeys: async () => [],
  };
  expectTypeOf(custom).toMatchTypeOf<FlagsStorage>();
});
