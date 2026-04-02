export type TerritoryNode = {
  id: string;
  name: string;
  code?: string | null;
  comment?: string | null;
  sort_order?: number | null;
  active?: boolean;
  children: TerritoryNode[];
};

export function newTerritoryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyNode(name = ""): TerritoryNode {
  return { id: newTerritoryId(), name, code: null, comment: null, sort_order: null, active: true, children: [] };
}

function cloneNode(n: TerritoryNode): TerritoryNode {
  return { id: n.id, name: n.name, children: n.children.map(cloneNode) };
}

export function cloneForest(nodes: TerritoryNode[]): TerritoryNode[] {
  return nodes.map(cloneNode);
}

export function collectDescendantIds(node: TerritoryNode): Set<string> {
  const s = new Set<string>([node.id]);
  for (const c of node.children) {
    collectDescendantIds(c).forEach((id) => {
      s.add(id);
    });
  }
  return s;
}

export function findNode(nodes: TerritoryNode[], id: string): TerritoryNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = findNode(n.children, id);
    if (f) return f;
  }
  return null;
}

/** Olib tashlash: { rest, node } yoki null */
export function extractNode(
  nodes: TerritoryNode[],
  id: string
): { rest: TerritoryNode[]; node: TerritoryNode } | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === id) {
      const rest = [...nodes.slice(0, i), ...nodes.slice(i + 1)];
      return { rest, node: cloneNode(n) };
    }
    const inner = extractNode(n.children, id);
    if (inner) {
      const rest = nodes.map((x, j) => (j === i ? { ...x, children: inner.rest } : x));
      return { rest, node: inner.node };
    }
  }
  return null;
}

export function insertUnder(
  nodes: TerritoryNode[],
  parentId: string | null,
  node: TerritoryNode
): TerritoryNode[] {
  const copy = cloneForest(nodes);
  if (parentId === null) {
    copy.push(cloneNode(node));
    return copy;
  }
  const parent = findNode(copy, parentId);
  if (!parent) return copy;
  parent.children.push(cloneNode(node));
  return copy;
}

export function moveNode(
  nodes: TerritoryNode[],
  nodeId: string,
  newParentId: string | null
): TerritoryNode[] {
  const extracted = extractNode(nodes, nodeId);
  if (!extracted) return nodes;
  const { rest, node } = extracted;
  if (newParentId != null) {
    if (newParentId === nodeId) return nodes;
    const desc = collectDescendantIds(node);
    if (desc.has(newParentId)) return nodes;
  }
  return insertUnder(rest, newParentId, node);
}

export function updateNodeName(nodes: TerritoryNode[], id: string, name: string): TerritoryNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, name };
    if (n.children.length) return { ...n, children: updateNodeName(n.children, id, name) };
    return n;
  });
}

export function updateNode(nodes: TerritoryNode[], id: string, patch: Partial<TerritoryNode>): TerritoryNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, ...patch };
    if (n.children.length) return { ...n, children: updateNode(n.children, id, patch) };
    return n;
  });
}

export function addChild(nodes: TerritoryNode[], parentId: string, child: TerritoryNode): TerritoryNode[] {
  return insertUnder(nodes, parentId, child);
}

export function addRoot(nodes: TerritoryNode[], node: TerritoryNode): TerritoryNode[] {
  return [...cloneForest(nodes), cloneNode(node)];
}

export function removeNode(nodes: TerritoryNode[], id: string): TerritoryNode[] {
  const extracted = extractNode(nodes, id);
  return extracted ? extracted.rest : nodes;
}

export type TerritoryPathOption = { id: string | null; label: string };

/** Ko‘chirish uchun: ildiz yoki har qanday tugun (o‘zi va uning avlodlari bundan mustasno). */
export function listValidParents(nodes: TerritoryNode[], movingId: string): TerritoryPathOption[] {
  const moving = findNode(nodes, movingId);
  if (!moving) return [{ id: null, label: "(ildiz)" }];
  const forbid = collectDescendantIds(moving);
  const opts: TerritoryPathOption[] = [{ id: null, label: "(ildiz)" }];

  function walk(list: TerritoryNode[], path: string) {
    for (const n of list) {
      if (forbid.has(n.id)) continue;
      const label = path ? `${path} / ${n.name}` : n.name;
      opts.push({ id: n.id, label });
      walk(n.children, label);
    }
  }

  walk(nodes, "");
  return opts;
}

function sortKey(node: TerritoryNode): [number, string] {
  const order = typeof node.sort_order === "number" ? node.sort_order : Number.MAX_SAFE_INTEGER;
  return [order, node.name.toLocaleLowerCase()];
}

export function sortForest(nodes: TerritoryNode[]): TerritoryNode[] {
  const sorted = cloneForest(nodes);
  const walk = (list: TerritoryNode[]) => {
    list.sort((a, b) => {
      const [ao, an] = sortKey(a);
      const [bo, bn] = sortKey(b);
      if (ao !== bo) return ao - bo;
      return an.localeCompare(bn);
    });
    for (const n of list) walk(n.children);
  };
  walk(sorted);
  return sorted;
}
