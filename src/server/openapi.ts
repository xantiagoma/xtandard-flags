/**
 * OpenAPI 3.1 description of the admin JSON API.
 *
 * Exposed two ways, mirroring how better-auth integrates with framework docs:
 *  - served at `GET {basePath}/api/openapi.json` for standalone tools (Scalar,
 *    Swagger UI, Postman, codegen);
 *  - returned by `createFetchHandler(...).openapi()` and `flagsPanel(...).openapi()`
 *    so you can MERGE it into your host app's OpenAPI document (e.g. Elysia's
 *    `@elysiajs/openapi` `references`, or Hono's OpenAPI).
 *
 * @module
 */

/** Options for {@link buildOpenApiDocument}. */
export interface OpenApiOptions {
  /** Mount prefix used in the `servers` url (e.g. `"/flags"`). */
  basePath?: string;
  /** Document title. */
  title?: string;
  /** Document version (defaults to the package's API version). */
  version?: string;
}

// Reusable JSON-schema fragments for the flag model.
const serveSchema = {
  oneOf: [
    { type: "object", required: ["variant"], properties: { variant: { type: "string" } } },
    {
      type: "object",
      required: ["split"],
      properties: {
        split: {
          type: "array",
          items: {
            type: "object",
            required: ["variant", "weight"],
            properties: { variant: { type: "string" }, weight: { type: "number", minimum: 0 } },
          },
        },
      },
    },
  ],
} as const;

const conditionOperators = [
  "equals",
  "notEquals",
  "in",
  "notIn",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
  "semverEquals",
  "semverGreaterThan",
  "semverLessThan",
  "exists",
  "notExists",
];

const schemas = {
  Variant: {
    type: "object",
    required: ["value"],
    properties: {
      value: { description: "boolean | string | number | JSON" },
      name: { type: "string" },
      description: { type: "string" },
    },
  },
  Condition: {
    type: "object",
    required: ["attribute", "operator"],
    properties: {
      attribute: { type: "string" },
      operator: { type: "string", enum: conditionOperators },
      value: {},
    },
  },
  Serve: serveSchema,
  Rule: {
    type: "object",
    required: ["id", "conditions", "serve"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      conditions: { type: "array", items: { $ref: "#/components/schemas/Condition" } },
      serve: { $ref: "#/components/schemas/Serve" },
    },
  },
  Override: {
    type: "object",
    required: ["targetingKey", "variant"],
    properties: { targetingKey: { type: "string" }, variant: { type: "string" } },
  },
  FlagOwner: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string" },
      email: { type: "string" },
      team: { type: "string" },
    },
  },
  Flag: {
    type: "object",
    required: ["key", "type", "enabled", "defaultVariant", "variants", "fallthrough"],
    properties: {
      key: { type: "string", pattern: "^[a-zA-Z0-9._-]+$" },
      type: { type: "string", enum: ["boolean", "string", "number", "json"] },
      enabled: { type: "boolean" },
      description: { type: "string" },
      defaultVariant: { type: "string" },
      variants: { type: "object", additionalProperties: { $ref: "#/components/schemas/Variant" } },
      overrides: { type: "array", items: { $ref: "#/components/schemas/Override" } },
      rules: { type: "array", items: { $ref: "#/components/schemas/Rule" } },
      fallthrough: { $ref: "#/components/schemas/Serve" },
      salt: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      owner: { $ref: "#/components/schemas/FlagOwner" },
      archivedAt: {
        type: "string",
        nullable: true,
        description: "ISO-8601 archive timestamp; archived flags are excluded from snapshots.",
      },
      createdAt: { type: "string", description: "ISO-8601 creation timestamp (server-stamped)." },
      updatedAt: {
        type: "string",
        description: "ISO-8601 last-update timestamp (server-stamped).",
      },
      expectedLifetimeDays: {
        type: "number",
        minimum: 0,
        description: "Expected lifetime in days; drives stale-flag detection.",
      },
    },
  },
  Draft: {
    type: "object",
    required: ["projectKey", "environmentKey", "flags"],
    properties: {
      projectKey: { type: "string" },
      environmentKey: { type: "string" },
      flags: { type: "object", additionalProperties: { $ref: "#/components/schemas/Flag" } },
      updatedAt: { type: "string" },
    },
  },
  Snapshot: {
    type: "object",
    required: ["schemaVersion", "version", "projectKey", "environmentKey", "createdAt", "flags"],
    properties: {
      schemaVersion: { type: "integer" },
      version: { type: "string" },
      projectKey: { type: "string" },
      environmentKey: { type: "string" },
      createdAt: { type: "string", format: "date-time" },
      createdBy: { type: "object", nullable: true },
      flags: { type: "object", additionalProperties: { $ref: "#/components/schemas/Flag" } },
    },
  },
  SnapshotSummary: {
    type: "object",
    properties: {
      version: { type: "string" },
      publishedAt: { type: "string" },
      by: { type: "string" },
      message: { type: "string" },
    },
  },
  AuditEntry: {
    type: "object",
    properties: {
      version: { type: "string" },
      action: { type: "string", enum: ["publish", "rollback", "update"] },
      at: { type: "string" },
      fromVersion: { type: "string" },
      message: { type: "string" },
    },
  },
  ProjectMeta: {
    type: "object",
    properties: {
      key: { type: "string" },
      name: { type: "string" },
      createdAt: { type: "string" },
    },
  },
  EnvironmentMeta: {
    type: "object",
    properties: {
      key: { type: "string" },
      name: { type: "string" },
      createdAt: { type: "string" },
    },
  },
  EvaluationResult: {
    type: "object",
    properties: {
      key: { type: "string" },
      value: {},
      variant: { type: "string" },
      reason: { type: "string" },
      errorCode: { type: "string" },
    },
  },
  Config: {
    type: "object",
    properties: {
      title: { type: "string" },
      basePath: { type: "string" },
      readonly: { type: "boolean" },
      authenticated: { type: "boolean" },
      defaultProjectKey: { type: "string" },
      defaultEnvironmentKey: { type: "string" },
    },
  },
  Error: {
    type: "object",
    required: ["error"],
    properties: {
      error: { type: "string" },
      code: { type: "string" },
      errors: { type: "array", items: { type: "object" } },
    },
  },
} as const;

const PROJECT = {
  name: "projectKey",
  in: "path",
  required: true,
  schema: { type: "string" },
} as const;
const ENV = {
  name: "environmentKey",
  in: "path",
  required: true,
  schema: { type: "string" },
} as const;

const jsonBody = (ref: string) => ({
  required: true,
  content: { "application/json": { schema: { $ref: ref } } },
});
const jsonRes = (desc: string, schema: object) => ({
  description: desc,
  content: { "application/json": { schema } },
});
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const errorRes = (desc: string) => jsonRes(desc, ref("Error"));

/** Build the OpenAPI 3.1 document for the admin API. Pure — safe to call anywhere. */
export function buildOpenApiDocument(options: OpenApiOptions = {}): Record<string, unknown> {
  const base = options.basePath && options.basePath !== "/" ? options.basePath : "";
  const envPath = "/api/projects/{projectKey}/environments/{environmentKey}";

  return {
    openapi: "3.1.0",
    info: {
      title: options.title ?? "Xtandard Flags Admin API",
      version: options.version ?? "0.1.0",
      description:
        "Admin/control-plane API for @xtandard/flags. Applications evaluate flags from memory via the OpenFeature provider; this API manages drafts, snapshots, publish/rollback, and audit.",
    },
    servers: [{ url: base || "/" }],
    tags: [
      { name: "meta" },
      { name: "projects" },
      { name: "environments" },
      { name: "flags" },
      { name: "snapshots" },
      { name: "audit" },
    ],
    paths: {
      "/config": {
        get: {
          tags: ["meta"],
          summary: "Bootstrap config (title, basePath, readonly, auth state)",
          responses: { "200": jsonRes("Config", ref("Config")) },
        },
      },
      "/api/openapi.json": {
        get: {
          tags: ["meta"],
          summary: "This OpenAPI document",
          responses: { "200": jsonRes("OpenAPI 3.1 document", { type: "object" }) },
        },
      },
      "/api/projects": {
        get: {
          tags: ["projects"],
          summary: "List projects",
          responses: { "200": jsonRes("Projects", { type: "array", items: ref("ProjectMeta") }) },
        },
        post: {
          tags: ["projects"],
          summary: "Create a project",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["key"],
                  properties: { key: { type: "string" }, name: { type: "string" } },
                },
              },
            },
          },
          responses: { "201": jsonRes("Created", ref("ProjectMeta")) },
        },
      },
      "/api/projects/{projectKey}/environments": {
        parameters: [PROJECT],
        get: {
          tags: ["environments"],
          summary: "List environments",
          responses: {
            "200": jsonRes("Environments", { type: "array", items: ref("EnvironmentMeta") }),
          },
        },
        post: {
          tags: ["environments"],
          summary: "Create an environment",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["key"],
                  properties: { key: { type: "string" }, name: { type: "string" } },
                },
              },
            },
          },
          responses: { "201": jsonRes("Created", ref("EnvironmentMeta")) },
        },
      },
      [`${envPath}/flags`]: {
        parameters: [PROJECT, ENV],
        get: {
          tags: ["flags"],
          summary: "List flags in the draft",
          responses: { "200": jsonRes("Flags", { type: "array", items: ref("Flag") }) },
        },
        post: {
          tags: ["flags"],
          summary: "Create a flag",
          requestBody: jsonBody("#/components/schemas/Flag"),
          responses: {
            "201": jsonRes("Created", ref("Flag")),
            "422": errorRes("Validation error"),
          },
        },
      },
      [`${envPath}/flags/{flagKey}`]: {
        parameters: [
          PROJECT,
          ENV,
          { name: "flagKey", in: "path", required: true, schema: { type: "string" } },
        ],
        get: {
          tags: ["flags"],
          summary: "Get a flag",
          responses: { "200": jsonRes("Flag", ref("Flag")), "404": errorRes("Not found") },
        },
        put: {
          tags: ["flags"],
          summary: "Update a flag",
          requestBody: jsonBody("#/components/schemas/Flag"),
          responses: {
            "200": jsonRes("Updated", ref("Flag")),
            "422": errorRes("Validation error"),
          },
        },
        delete: {
          tags: ["flags"],
          summary: "Delete a flag",
          responses: {
            "200": jsonRes("Deleted", { type: "object" }),
            "404": errorRes("Not found"),
          },
        },
      },
      [`${envPath}/flags/{flagKey}/archive`]: {
        parameters: [
          PROJECT,
          ENV,
          { name: "flagKey", in: "path", required: true, schema: { type: "string" } },
        ],
        post: {
          tags: ["flags"],
          summary: "Archive a flag (excluded from future snapshots)",
          responses: {
            "200": jsonRes("Archived", ref("Flag")),
            "404": errorRes("Not found"),
          },
        },
      },
      [`${envPath}/flags/{flagKey}/restore`]: {
        parameters: [
          PROJECT,
          ENV,
          { name: "flagKey", in: "path", required: true, schema: { type: "string" } },
        ],
        post: {
          tags: ["flags"],
          summary: "Restore an archived flag",
          responses: {
            "200": jsonRes("Restored", ref("Flag")),
            "404": errorRes("Not found"),
          },
        },
      },
      [`${envPath}/draft`]: {
        parameters: [PROJECT, ENV],
        get: {
          tags: ["flags"],
          summary: "Get the working draft",
          responses: { "200": jsonRes("Draft", ref("Draft")) },
        },
        put: {
          tags: ["flags"],
          summary: "Replace the working draft",
          requestBody: jsonBody("#/components/schemas/Draft"),
          responses: { "200": jsonRes("Draft", ref("Draft")), "422": errorRes("Validation error") },
        },
      },
      [`${envPath}/publish`]: {
        parameters: [PROJECT, ENV],
        post: {
          tags: ["snapshots"],
          summary: "Compile the draft into a new snapshot and activate it",
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "object", properties: { message: { type: "string" } } },
              },
            },
          },
          responses: {
            "201": jsonRes("Published snapshot", ref("Snapshot")),
            "422": errorRes("Validation error"),
          },
        },
      },
      [`${envPath}/rollback`]: {
        parameters: [PROJECT, ENV],
        post: {
          tags: ["snapshots"],
          summary: "Re-point the active version to an existing snapshot",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["version"],
                  properties: { version: { type: "string" }, message: { type: "string" } },
                },
              },
            },
          },
          responses: {
            "200": jsonRes("Active snapshot", ref("Snapshot")),
            "404": errorRes("Not found"),
          },
        },
      },
      [`${envPath}/snapshots`]: {
        parameters: [PROJECT, ENV],
        get: {
          tags: ["snapshots"],
          summary: "List snapshot versions",
          responses: {
            "200": jsonRes("Versions + active", {
              type: "object",
              properties: {
                versions: { type: "array", items: ref("SnapshotSummary") },
                active: { type: "string", nullable: true },
              },
            }),
          },
        },
      },
      [`${envPath}/snapshots/{version}`]: {
        parameters: [
          PROJECT,
          ENV,
          { name: "version", in: "path", required: true, schema: { type: "string" } },
        ],
        get: {
          tags: ["snapshots"],
          summary: "Get a snapshot by version",
          responses: { "200": jsonRes("Snapshot", ref("Snapshot")), "404": errorRes("Not found") },
        },
      },
      [`${envPath}/active`]: {
        parameters: [PROJECT, ENV],
        get: {
          tags: ["snapshots"],
          summary: "Get the active snapshot",
          responses: {
            "200": jsonRes("Active snapshot (or null)", {
              oneOf: [ref("Snapshot"), { type: "null" }],
            }),
          },
        },
      },
      [`${envPath}/audit`]: {
        parameters: [PROJECT, ENV],
        get: {
          tags: ["audit"],
          summary: "List audit entries (newest first)",
          responses: { "200": jsonRes("Audit", { type: "array", items: ref("AuditEntry") }) },
        },
      },
      [`${envPath}/evaluate`]: {
        parameters: [PROJECT, ENV],
        post: {
          tags: ["flags"],
          summary: "Test how flags resolve for an evaluation context",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    context: { type: "object", additionalProperties: true },
                    flagKey: { type: "string" },
                    source: { type: "string", enum: ["draft", "active"] },
                  },
                },
              },
            },
          },
          responses: {
            "200": jsonRes("Evaluation results", {
              type: "object",
              properties: { results: { type: "array", items: ref("EvaluationResult") } },
            }),
          },
        },
      },
      [`${envPath}/bootstrap`]: {
        parameters: [PROJECT, ENV],
        post: {
          tags: ["flags"],
          summary: "Prefetch all flags as a keyed map (for client SDKs)",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    context: { type: "object", additionalProperties: true },
                    source: { type: "string", enum: ["draft", "active"], default: "active" },
                  },
                },
              },
            },
          },
          responses: {
            "200": jsonRes("Resolved flag map", {
              type: "object",
              properties: {
                flags: {
                  type: "object",
                  additionalProperties: {
                    type: "object",
                    properties: {
                      value: {},
                      variant: { type: "string" },
                      reason: { type: "string" },
                    },
                  },
                },
              },
            }),
          },
        },
      },
    },
    components: {
      schemas,
      securitySchemes: { basicAuth: { type: "http", scheme: "basic" } },
    },
  };
}
