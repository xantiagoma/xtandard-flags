export type FlagType = "boolean" | "string" | "number" | "json";

export interface Variant {
  value: unknown;
  name?: string;
  description?: string;
}

export type Serve = { variant: string } | { split: { variant: string; weight: number }[] };

export type ConditionOperator =
  | "equals"
  | "notEquals"
  | "in"
  | "notIn"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "lessThan"
  | "lessThanOrEqual"
  | "semverEquals"
  | "semverGreaterThan"
  | "semverLessThan"
  | "exists"
  | "notExists";

export interface Condition {
  attribute: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface Rule {
  id: string;
  name?: string;
  conditions: Condition[];
  serve: Serve;
}

export interface Flag {
  key: string;
  type: FlagType;
  enabled: boolean;
  description?: string;
  defaultVariant: string;
  variants: Record<string, Variant>;
  overrides?: { targetingKey: string; variant: string }[];
  rules?: Rule[];
  fallthrough: Serve;
  salt?: string;
  tags?: string[];
}

export interface FlagsConfig {
  title: string;
  basePath: string;
  readonly: boolean;
  authenticated?: boolean;
  defaultProjectKey: string;
  defaultEnvironmentKey: string;
}

export interface SnapshotSummary {
  version: string;
  publishedAt?: string;
  by?: string;
  message?: string;
}

export interface SnapshotListResponse {
  versions: SnapshotSummary[];
  active: string | null;
}

export interface AuditEntry {
  id?: string;
  action: string;
  version?: string;
  by?: string;
  at?: string;
  message?: string;
  flagKey?: string;
}

export interface ApiError {
  status: number;
  error: string;
  code?: string;
  errors?: { path?: string; message: string }[];
}

export class FlagsApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(body.error);
    this.name = "FlagsApiError";
  }
}
