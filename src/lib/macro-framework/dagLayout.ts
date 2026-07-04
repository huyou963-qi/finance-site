export type DAGLayoutEdge = {
  from: string;
  to: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  isBackEdge: boolean;
};

export type DAGLayoutNode = {
  id: string;
  x: number;
  y: number;
  rank: number;
  order: number;
};

export type DAGLayoutResult = {
  nodes: DAGLayoutNode[];
  edges: DAGLayoutEdge[];
  width: number;
  height: number;
};

export function computeDAGLayout(options: {
  nodes: Array<{ id: string }>;
  edges: Array<{ from: string; to: string }>;
  nodeWidth: number;
  nodeHeight: number;
  rankGap: number;
  nodeGap: number;
  padding: number;
}): DAGLayoutResult {
  const { nodes, edges, nodeWidth, nodeHeight, rankGap, nodeGap, padding } = options;
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    outEdges.set(n.id, []);
  }
  for (const e of edges) {
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
    outEdges.get(e.from)?.push(e.to);
  }

  const rank = new Map<string, number>();
  const queue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  for (const id of queue) rank.set(id, 0);

  const inDegCopy = new Map(inDegree);
  while (queue.length) {
    const id = queue.shift()!;
    const r = rank.get(id)!;
    for (const to of outEdges.get(id) ?? []) {
      rank.set(to, Math.max(rank.get(to) ?? 0, r + 1));
      inDegCopy.set(to, inDegCopy.get(to)! - 1);
      if (inDegCopy.get(to) === 0) queue.push(to);
    }
  }
  for (const n of nodes) {
    if (!rank.has(n.id)) rank.set(n.id, 0);
  }

  const ranks = new Map<number, string[]>();
  for (const n of nodes) {
    const r = rank.get(n.id)!;
    if (!ranks.has(r)) ranks.set(r, []);
    ranks.get(r)!.push(n.id);
  }

  const layoutNodes: DAGLayoutNode[] = [];
  let maxW = 0;
  let maxH = 0;
  for (const [r, ids] of [...ranks.entries()].sort((a, b) => a[0] - b[0])) {
    ids.forEach((id, order) => {
      const x = padding + r * (nodeWidth + rankGap);
      const y = padding + order * (nodeHeight + nodeGap);
      layoutNodes.push({ id, x, y, rank: r, order });
      maxW = Math.max(maxW, x + nodeWidth);
      maxH = Math.max(maxH, y + nodeHeight);
    });
  }

  const pos = Object.fromEntries(layoutNodes.map((n) => [n.id, n]));
  const layoutEdges: DAGLayoutEdge[] = edges.map((e) => ({
    from: e.from,
    to: e.to,
    sourceX: pos[e.from].x + nodeWidth,
    sourceY: pos[e.from].y + nodeHeight / 2,
    targetX: pos[e.to].x,
    targetY: pos[e.to].y + nodeHeight / 2,
    isBackEdge: rank.get(e.to)! <= rank.get(e.from)!,
  }));

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    width: maxW + padding,
    height: maxH + padding,
  };
}
