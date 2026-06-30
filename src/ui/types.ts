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
  | "notExists"
  | "inSegment"
  | "notInSegment"
  | "matches"
  | "notMatches";

export interface Condition {
  attribute: string;
  operator: ConditionOperator;
  value?: unknown;
  /** For `matches`/`notMatches`: name of the registered query matcher. */
  matcher?: string;
}

/** Boolean group: AND (`all`), OR (`any`), or NOT (`not`) of nested nodes. */
export type ConditionGroup =
  | { all: ConditionNode[]; any?: never; not?: never }
  | { any: ConditionNode[]; all?: never; not?: never }
  | { not: ConditionNode; all?: never; any?: never };

/** A leaf {@link Condition} or a boolean {@link ConditionGroup}. */
export type ConditionNode = Condition | ConditionGroup;

export const isConditionGroup = (node: ConditionNode): node is ConditionGroup =>
  typeof node === "object" && node !== null && ("all" in node || "any" in node || "not" in node);

/** Depth-first walk of every leaf {@link Condition} under a list of nodes. */
export function leafConditions(nodes: ConditionNode[]): Condition[] {
  const out: Condition[] = [];
  const visit = (node: ConditionNode): void => {
    if (!isConditionGroup(node)) {
      out.push(node);
      return;
    }
    if (node.all) node.all.forEach(visit);
    else if (node.any) node.any.forEach(visit);
    else if (node.not) visit(node.not);
  };
  nodes.forEach(visit);
  return out;
}

export interface Rule {
  id: string;
  name?: string;
  conditions: ConditionNode[];
  serve: Serve;
}

export interface FlagOwner {
  name: string;
  email?: string;
  team?: string;
}

export interface Segment {
  key: string;
  name?: string;
  description?: string;
  conditions: ConditionNode[];
}

export interface Flag {
  key: string;
  type: FlagType;
  enabled: boolean;
  description?: string;
  defaultVariant: string;
  variants: Record<string, Variant>;
  prerequisites?: { flagKey: string; variant: string }[];
  overrides?: { targetingKey: string; variant: string }[];
  rules?: Rule[];
  fallthrough: Serve;
  salt?: string;
  tags?: string[];
  owner?: FlagOwner;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  expectedLifetimeDays?: number;
}

export interface FlagsConfig {
  title: string;
  basePath: string;
  readonly: boolean;
  authenticated?: boolean;
  defaultProjectKey: string;
  defaultEnvironmentKey: string;
  /** Logo image URL shown in the navbar in place of the title wordmark. */
  logoUrl?: string;
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
  /** Actor who made the change (server sends an object; older data may be a string). */
  by?: { id: string; email?: string; name?: string } | string | null;
  /** For rollback: the version that was active before. */
  fromVersion?: string;
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
