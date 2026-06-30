import React from "react";
import { Parentheses, Plus, Trash2 } from "lucide-react";
import type { Condition, ConditionGroup, ConditionNode } from "../types.ts";
import { isConditionGroup } from "../types.ts";
import { ConditionRow } from "./ConditionRow.tsx";
import { Dropdown } from "./primitives.tsx";
import { Button } from "./ui-bits.tsx";

const newLeaf = (): Condition => ({ attribute: "", operator: "equals", value: "" });
const newGroup = (): ConditionGroup => ({ any: [newLeaf()] });

/** UI combinator: All=AND, Any=OR, None=NOR (`not` of an `any`). */
type Combinator = "all" | "any" | "none";

const COMBINATORS: { value: Combinator; label: string }[] = [
  { value: "all", label: "All (AND)" },
  { value: "any", label: "Any (OR)" },
  { value: "none", label: "None (NOR)" },
];

const JOINER: Record<Combinator, string> = { all: "And", any: "Or", none: "Nor" };

/** Read a group's combinator + child nodes (normalizing `not` → "none of any"). */
function readGroup(group: ConditionGroup): { kind: Combinator; children: ConditionNode[] } {
  if ("all" in group && group.all) return { kind: "all", children: group.all };
  if ("any" in group && group.any) return { kind: "any", children: group.any };
  const inner = (group as { not: ConditionNode }).not;
  if (isConditionGroup(inner)) {
    const c = ("any" in inner && inner.any) || ("all" in inner && inner.all) || [];
    return { kind: "none", children: c as ConditionNode[] };
  }
  return { kind: "none", children: [inner] };
}

/** Build a group node from a combinator + children. */
function buildGroup(kind: Combinator, children: ConditionNode[]): ConditionGroup {
  if (kind === "all") return { all: children };
  if (kind === "any") return { any: children };
  return { not: { any: children } };
}

/**
 * Recursive boolean-condition builder: a list of nodes (top-level AND) where each
 * node is a leaf {@link ConditionRow} or a nested AND/OR/NOT group box. Mirrors a
 * filter-builder UX — "Add condition" / "Add group", per-group combinator toggle.
 */
export function ConditionTree({
  nodes,
  onChange,
  readonly,
  segmentKeys = [],
  joiner,
  depth = 0,
}: {
  nodes: ConditionNode[];
  onChange: (nodes: ConditionNode[]) => void;
  readonly: boolean;
  segmentKeys?: string[];
  /** Joiner word for rows at this level (from the parent group); top level → If/And. */
  joiner?: string;
  depth?: number;
}) {
  const setAt = (i: number, n: ConditionNode) => onChange(nodes.map((x, j) => (j === i ? n : x)));
  const removeAt = (i: number) => onChange(nodes.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      {nodes.map((node, i) =>
        isConditionGroup(node) ? (
          <GroupBox
            key={i}
            group={node}
            isFirst={i === 0}
            joiner={joiner}
            readonly={readonly}
            segmentKeys={segmentKeys}
            depth={depth}
            onChange={(g) => setAt(i, g)}
            onRemove={() => removeAt(i)}
          />
        ) : (
          <ConditionRow
            key={i}
            condition={node}
            isFirst={i === 0}
            joiner={joiner}
            readonly={readonly}
            segmentKeys={segmentKeys}
            onChange={(c) => setAt(i, c)}
            onRemove={() => removeAt(i)}
          />
        ),
      )}
      {!readonly && (
        <div className="flex gap-2 pl-8">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<Plus className="size-3.5" />}
            onClick={() => onChange([...nodes, newLeaf()])}
          >
            Add condition
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<Parentheses className="size-3.5" />}
            onClick={() => onChange([...nodes, newGroup()])}
          >
            Add group
          </Button>
        </div>
      )}
    </div>
  );
}

function GroupBox({
  group,
  onChange,
  onRemove,
  readonly,
  segmentKeys,
  depth,
  joiner,
  isFirst,
}: {
  group: ConditionGroup;
  onChange: (g: ConditionGroup) => void;
  onRemove: () => void;
  readonly: boolean;
  segmentKeys: string[];
  depth: number;
  joiner?: string;
  isFirst: boolean;
}) {
  const { kind, children } = readGroup(group);
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="w-8 shrink-0 text-xs font-medium uppercase text-muted-foreground">
          {isFirst ? (joiner ? "" : "If") : (joiner ?? "And")}
        </span>
        <Parentheses className="size-3.5 shrink-0 text-muted-foreground" />
        <Dropdown
          value={kind}
          onValueChange={(k) => onChange(buildGroup(k as Combinator, children))}
          options={COMBINATORS}
          disabled={readonly}
          className="w-36"
          aria-label="Group combinator"
        />
        <span className="text-xs text-muted-foreground">of the following</span>
        <div className="flex-1" />
        {!readonly && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive"
            aria-label="Remove group"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      <div className="border-l-2 border-border/60 pl-2">
        <ConditionTree
          nodes={children}
          onChange={(next) => onChange(buildGroup(kind, next))}
          readonly={readonly}
          segmentKeys={segmentKeys}
          joiner={JOINER[kind]}
          depth={depth + 1}
        />
      </div>
    </div>
  );
}
