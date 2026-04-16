import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Pause, Play, RotateCcw, Route } from "lucide-react";

// Separate example graphs for each algorithm
const DEFAULT_EDGES_DFS = `(A,B)
(A,C)
(A,D)
(B,E)
(B,F)
(C,G)
(D,H)
(D,I)
(F,G)
(G,H)`;

const DEFAULT_EDGES_BFS = `(S,A)
(S,B)
(A,C)
(A,D)
(B,E)
(C,F)
(D,G)
(E,H)
(F,I)
(G,J)`;

const DEFAULT_EDGES_UCS = `(S,A,2)
(S,B,4)
(A,C,2)
(A,D,5)
(B,D,1)
(C,E,3)
(D,E,1)
(D,F,4)
(E,G,2)
(F,G,1)`;

function buildAdjFromEdgeList(nodes, edges, weighted) {
  const adj = Object.fromEntries(nodes.map((n) => [n, []]));
  for (const [u, v, w] of edges) {
    adj[u].push(weighted ? { to: v, weight: w } : v);
    adj[v].push(weighted ? { to: u, weight: w } : u);
  }
  Object.keys(adj).forEach((k) => {
    adj[k].sort((a, b) => {
      const aa = weighted ? a.to : a;
      const bb = weighted ? b.to : b;
      return aa.localeCompare(bb);
    });
  });
  return adj;
}

function parseEdgeList(text, algorithm) {
  const lines = text
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  const nodeSet = new Set();
  const edgeMap = new Map();

  for (const line of lines) {
    if (!line.startsWith("(") || !line.endsWith(")")) {
      throw new Error('Each edge must be like (A,B) or (A,B,3).');
    }
    const inner = line.slice(1, -1);
    const parts = inner.split(",").map((p) => p.trim()).filter(Boolean);
    if (algorithm === "ucs") {
      if (parts.length !== 3) throw new Error("UCS input must be (from,to,weight).");
    } else if (parts.length !== 2) {
      throw new Error("DFS/BFS input must be (from,to).");
    }
    const [u, v, wRaw] = parts;
    if (!u || !v) throw new Error("Edge must contain two node ids.");
    const w = algorithm === "ucs" ? Number(wRaw) : 1;
    if (algorithm === "ucs" && !Number.isFinite(w)) throw new Error("Weight must be a number.");
    nodeSet.add(u);
    nodeSet.add(v);
    const key = [u, v].sort().join("~");
    if (!edgeMap.has(key)) edgeMap.set(key, [u, v, w]);
  }

  const nodes = [...nodeSet].sort();
  const edges = [...edgeMap.values()];
  return { nodes, edges };
}

function reconstructPath(parent, start, goal) {
  const path = [];
  let cur = goal;
  while (cur) {
    path.push(cur);
    if (cur === start) break;
    cur = parent[cur];
  }
  return path[path.length - 1] === start ? path.reverse() : [];
}

function createFrames(algorithm, graph) {
  const { nodes, edges, start, goal } = graph;
  const weighted = algorithm === "ucs";
  const weightedEdges = weighted ? edges : edges.map(([u, v]) => [u, v, 1]);
  const adj = buildAdjFromEdgeList(
    nodes,
    weightedEdges,
    weighted,
  );
  const frames = [];
  if (algorithm === "dfs") {
    const visited = new Set();
    const stack = [start];
    const parent = {};
    const out = [];
    while (stack.length) {
      const cur = stack.pop();
      if (visited.has(cur)) continue;
      visited.add(cur);
      out.push(cur);
      frames.push({ current: cur, visited: [...visited], frontier: [...stack], output: [...out], path: [] });
      if (cur === goal) {
        frames.push({ current: cur, visited: [...visited], frontier: [...stack], output: [...out], path: reconstructPath(parent, start, goal) });
        break;
      }
      const neighbors = [...adj[cur]].sort().reverse();
      for (const n of neighbors) {
        if (!visited.has(n)) {
          if (!(n in parent)) parent[n] = cur;
          stack.push(n);
        }
      }
    }
    return frames;
  }
  if (algorithm === "bfs") {
    const visited = new Set([start]);
    const q = [start];
    const parent = {};
    const out = [];
    while (q.length) {
      const cur = q.shift();
      out.push(cur);
      frames.push({ current: cur, visited: [...visited], frontier: [...q], output: [...out], path: [] });
      if (cur === goal) {
        frames.push({ current: cur, visited: [...visited], frontier: [...q], output: [...out], path: reconstructPath(parent, start, goal) });
        break;
      }
      for (const n of adj[cur]) {
        if (!visited.has(n)) {
          visited.add(n);
          parent[n] = cur;
          q.push(n);
        }
      }
    }
    return frames;
  }

  const visited = new Set();
  const pq = [{ node: start, cost: 0 }];
  const best = { [start]: 0 };
  const parent = {};
  const out = [];
  while (pq.length) {
    pq.sort((a, b) => a.cost - b.cost || a.node.localeCompare(b.node));
    const cur = pq.shift();
    if (visited.has(cur.node)) continue;
    visited.add(cur.node);
    out.push(`${cur.node}:${cur.cost}`);
    frames.push({ current: cur.node, visited: [...visited], frontier: pq.map((x) => `${x.node}:${x.cost}`), output: [...out], path: [], totalCost: cur.cost });
    if (cur.node === goal) {
      frames.push({ current: cur.node, visited: [...visited], frontier: pq.map((x) => `${x.node}:${x.cost}`), output: [...out], path: reconstructPath(parent, start, goal), totalCost: cur.cost });
      break;
    }
    for (const { to, weight } of adj[cur.node]) {
      const nc = cur.cost + weight;
      if (best[to] === undefined || nc < best[to]) {
        best[to] = nc;
        parent[to] = cur.node;
        pq.push({ node: to, cost: nc });
      }
    }
  }
  return frames;
}

function usePlayback(frames, speed) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!playing) return undefined;
    if (index >= frames.length - 1) {
      setPlaying(false);
      return undefined;
    }
    timer.current = setTimeout(() => setIndex((i) => i + 1), speed);
    return () => clearTimeout(timer.current);
  }, [playing, index, frames.length, speed]);

  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [frames]);

  return {
    frame: frames[index] || null,
    index,
    playing,
    setPlaying,
    reset: () => {
      setIndex(0);
      setPlaying(false);
    },
  };
}

function layoutNodes(nodes, algorithm) {
  // Custom clearer layout for UCS example graph
  if (algorithm === "ucs") {
    const map = {};
    // Layered layout tuned for DEFAULT_EDGES_UCS nodes
    map.S = { x: 15, y: 50 };
    map.A = { x: 35, y: 30 };
    map.B = { x: 35, y: 70 };
    map.C = { x: 55, y: 20 };
    map.D = { x: 55, y: 50 };
    map.E = { x: 75, y: 35 };
    map.F = { x: 75, y: 65 };
    map.G = { x: 90, y: 50 };
    return Object.fromEntries(nodes.map((n, i) => [n, map[n] || { x: 20 + i * 8, y: 50 }]));
  }

  const r = 35;
  const cx = 50;
  const cy = 50;
  return Object.fromEntries(
    nodes.map((n, i) => {
      const t = (2 * Math.PI * i) / Math.max(nodes.length, 1);
      return [n, { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) }];
    }),
  );
}

export default function App() {
  const [algorithm, setAlgorithm] = useState("dfs");
  const [weighted, setWeighted] = useState(false);
  const [rawInput, setRawInput] = useState(DEFAULT_EDGES_DFS);
  const [start, setStart] = useState("A");
  const [goal, setGoal] = useState("H");
  const [speed, setSpeed] = useState(900);
  const [error, setError] = useState("");
  const [graph, setGraph] = useState({ nodes: [], edges: [], start: "", goal: "" });

  // Ensure weighting is only used for UCS and always on there
  useEffect(() => {
    if (algorithm === "ucs" && !weighted) {
      setWeighted(true);
    }
    if (algorithm !== "ucs" && weighted) {
      setWeighted(false);
    }
  }, [algorithm, weighted]);

  const parseInput = () => {
    try {
      const parsed = parseEdgeList(rawInput, algorithm);
      let s = (start || "").trim();
      let g = (goal || "").trim();

      // If user-provided start/goal don't exist in the input graph,
      // fall back to valid nodes so playback always has frames.
      if (!parsed.nodes.includes(s)) s = parsed.nodes[0];
      if (!parsed.nodes.includes(g)) g = parsed.nodes[parsed.nodes.length - 1];

      setStart(s);
      setGoal(g);
      setGraph({ ...parsed, start: s, goal: g });
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    parseInput();
  }, [algorithm]); // eslint-disable-line react-hooks/exhaustive-deps

  const frames = useMemo(() => {
    if (!graph.nodes.length) return [];
    return createFrames(algorithm, graph);
  }, [algorithm, graph]);

  const { frame, index, playing, setPlaying, reset } = usePlayback(frames, speed);
  const positions = useMemo(() => layoutNodes(graph.nodes, algorithm), [graph.nodes, algorithm]);
  const frontierSet = new Set((frame?.frontier || []).map((x) => (x.includes ? x.split(":")[0] : x)));
  const visitedSet = new Set(frame?.visited || []);
  const pathSet = new Set(frame?.path || []);

  return (
    <div className="container">
      <div className="card header">
        <div className="title">
          <Bot size={22} />
          <span>Robot Path Planner</span>
        </div>
        <div className="pill-group">
          {["dfs", "bfs", "ucs"].map((x) => (
            <button
              key={x}
              type="button"
              className={`pill ${algorithm === x ? "active" : ""}`}
              onClick={() => {
                setAlgorithm(x);
                if (x === "dfs") setRawInput(DEFAULT_EDGES_DFS);
                if (x === "bfs") setRawInput(DEFAULT_EDGES_BFS);
                if (x === "ucs") setRawInput(DEFAULT_EDGES_UCS);
              }}
            >
              {x.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card section">
          <h3 style={{ marginTop: 0 }}>Graph Input</h3>
          <div className="pill-group" style={{ marginBottom: 10 }}>
            <button
              type="button"
              className="pill"
              onClick={() => {
                if (algorithm === "dfs") setRawInput(DEFAULT_EDGES_DFS);
                if (algorithm === "bfs") setRawInput(DEFAULT_EDGES_BFS);
                if (algorithm === "ucs") setRawInput(DEFAULT_EDGES_UCS);
              }}
            >
              Load {algorithm.toUpperCase()} Example
            </button>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            Input edges one per line. DFS/BFS: <code>(A,B)</code>. UCS: <code>(A,B,3)</code>.
          </p>
          <textarea rows={10} value={rawInput} onChange={(e) => setRawInput(e.target.value)} />
          <div className="form-grid" style={{ marginTop: 10 }}>
            <div>
              <label htmlFor="start">Start Node</label>
              <input id="start" value={start} onChange={(e) => setStart(e.target.value.trim())} />
            </div>
            <div>
              <label htmlFor="goal">Goal Node</label>
              <input id="goal" value={goal} onChange={(e) => setGoal(e.target.value.trim())} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={parseInput}>Apply Graph</button>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </div>

        <div className="card section">
          <h3 style={{ marginTop: 0 }}>Visualization</h3>
          <div className="controls">
            <button type="button" className="btn" onClick={() => setPlaying(true)} disabled={!!error || frames.length === 0}><Play size={16} /> Play</button>
            <button type="button" className="btn secondary" onClick={() => setPlaying(false)} disabled={!playing}><Pause size={16} /> Pause</button>
            <button type="button" className="btn secondary" onClick={reset} disabled={frames.length === 0}><RotateCcw size={16} /> Reset</button>
          </div>
          <div style={{ marginTop: 10 }}>
            <label htmlFor="speed">Speed: {speed}ms</label>
            <input id="speed" type="range" min="250" max="1500" step="50" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
          </div>
          <div className="stats" style={{ marginTop: 14 }}>
            <div className="stat"><strong>Current:</strong> {frame?.current || "-"}</div>
            <div className="stat"><strong>Visited:</strong> {frame?.visited?.length || 0}</div>
            <div className="stat"><strong>Step:</strong> {frames.length ? `${index + 1}/${frames.length}` : "0/0"}</div>
            <div className="stat"><strong>Cost:</strong> {frame?.totalCost ?? 0}</div>
          </div>
        </div>
      </div>

      <div className="card section" style={{ marginTop: 16 }}>
        <svg
          viewBox="0 0 100 100"
          style={{
            width: "100%",
            height: 380,
            background: algorithm === "ucs" ? "#e0f2fe" : "#f8fafc",
            borderRadius: 12,
          }}
        >
          {(graph.edges || []).map(([u, v, w], i) => {
            const a = positions[u];
            const b = positions[v];
            if (!a || !b) return null;
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            return (
              <g key={`${u}-${v}-${i}`}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={algorithm === "ucs" ? "#0ea5e9" : "#94a3b8"}
                  strokeWidth={algorithm === "ucs" ? 2 : 1.2}
                />
                {algorithm === "ucs" && (
                  <text
                    x={midX}
                    y={midY - 1.5}
                    textAnchor="middle"
                    fontSize="3.2"
                    fill="#0f172a"
                    fontWeight="600"
                  >
                    {w}
                  </text>
                )}
              </g>
            );
          })}
          {graph.nodes.map((n) => {
            const p = positions[n];
            let fill = "#cbd5e1";
            if (n === graph.start) fill = "#22c55e";
            if (n === graph.goal) fill = "#ef4444";
            if (visitedSet.has(n)) fill = "#38bdf8";
            if (frontierSet.has(n)) fill = "#a78bfa";
            if (pathSet.has(n)) fill = "#f59e0b";
            if (frame?.current === n) fill = "#2563eb";
            return (
              <g key={n}>
                <circle cx={p.x} cy={p.y} r="4.2" fill={fill} />
                <text x={p.x} y={p.y + 0.8} textAnchor="middle" dominantBaseline="middle" fontSize="3" fill="#fff">{n}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card section">
          <h3 style={{ marginTop: 0 }}>Traversal Output</h3>
          <div className="output">
            <AnimatePresence>
              {(frame?.output || []).map((item, i) => (
                <motion.div
                  key={`${item}-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="chip"
                >
                  {item}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <div className="card section">
          <h3 style={{ marginTop: 0 }}>Algorithm Notes</h3>
          <p className="muted">
            {algorithm === "dfs" && "DFS explores deep first using a stack and then backtracks."}
            {algorithm === "bfs" && "BFS explores level by level with a queue and gives shortest path in unweighted graphs."}
            {algorithm === "ucs" && "UCS expands the lowest cost node first, ideal for weighted graphs."}
          </p>
          <div className="stat">
            <Route size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Path: {frame?.path?.length ? frame.path.join(" -> ") : "Not reached yet"}
          </div>
        </div>
      </div>
    </div>
  );
}
