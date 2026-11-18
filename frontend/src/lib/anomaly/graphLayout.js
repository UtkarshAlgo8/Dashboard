/** Deterministic layered cause/effect layout; bounded even if a future graph has cycles. */
export default function graphLayout(modes, edges) {
  const ids = [...new Set(edges.flatMap((edge) => [edge.p, edge.c]))].filter(
    (id) => modes[id],
  );
  const parents = {},
    children = {},
    depth = {},
    indegree = {};
  ids.forEach((id) => {
    parents[id] = [];
    children[id] = [];
    depth[id] = 0;
    indegree[id] = 0;
  });
  edges.forEach((edge) => {
    if (!parents[edge.c] || !children[edge.p]) return;
    parents[edge.c].push(edge.p);
    children[edge.p].push(edge.c);
    indegree[edge.c]++;
  });
  const queue = ids.filter((id) => !indegree[id]);
  const visited = new Set();
  while (queue.length) {
    const id = queue.shift();
    visited.add(id);
    children[id].forEach((child) => {
      depth[child] = Math.max(depth[child], depth[id] + 1);
      if (--indegree[child] === 0) queue.push(child);
    });
  }
  ids
    .filter((id) => !visited.has(id))
    .forEach((id) => {
      depth[id] = 0;
    });
  const columns = Array.from(
    { length: Math.max(0, ...Object.values(depth)) + 1 },
    (_, index) =>
      ids
        .filter((id) => depth[id] === index)
        .sort(
          (a, b) =>
            modes[a].se.localeCompare(modes[b].se) || a.localeCompare(b),
        ),
  );
  const maxRows = Math.max(1, ...columns.map((column) => column.length));
  const positions = {};
  columns.forEach((column, col) =>
    column.forEach((id, row) => {
      positions[id] = {
        x: 16 + col * 252,
        y: 32 + row * 58 + (maxRows - column.length) * 29,
      };
    }),
  );
  return {
    ids,
    positions,
    width: Math.max(300, columns.length * 252),
    height: maxRows * 58 + 55,
  };
}
