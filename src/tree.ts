import { Chess } from "chess.js";
import { createStructuralRuntime } from "./game-tree-runtime.js";
import { GAME_TREE_VERSION, type GameStructure, type GameStructureEdge, type GameStructureMoveInput, type StructureSequenceMove } from "./contracts";
export * from "./contracts";

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const LINK_ID = /^[a-f][0-9a-f]{5}$/;
const NODE_ID = /^n[A-Za-z0-9_-]{1,63}$/;
const EDGE_ID = /^e[A-Za-z0-9_-]{1,63}$/;
export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
function runtime(tree?: GameStructure) { return createStructuralRuntime(tree, Chess); }
function stringList(value: unknown, limit = 100) {
  return Array.isArray(value) ? value.slice(0, limit).map(item => String(item).slice(0, 2_000)) : [];
}
function hash32(value: string): number { return runtime().treeHash32(value); }
function pathDigest(startFen: string, moves: readonly string[]): string { return runtime().treePathDigest(startFen, moves); }
export function deterministicTreeEdgeId(startFen: string, moves: readonly string[]) {
  if (!moves.length || moves.some((move) => !UCI_MOVE.test(String(move).toLowerCase()))) {
    throw new Error("A deterministic edge ID requires a legal-looking UCI path.");
  }
  return `ep1_${pathDigest(new Chess(startFen).fen(), moves)}`;
}
function linkIdForPath(path: string, occupied: Set<string>) {
  let attempt = 0;
  while (attempt < 1_000) {
    const hex = hash32(`${path}|${attempt}`).toString(16).padStart(8, "0").slice(0, 6);
    const id = `${"abcdef"[Number.parseInt(hex[0], 16) % 6]}${hex.slice(1)}`;
    if (!occupied.has(id)) {
      occupied.add(id);
      return id;
    }
    attempt += 1;
  }
  throw new Error("Could not allocate a unique move link id.");
}


export function createGameStructure(startFen = START_FEN): GameStructure {
  const fen = new Chess(startFen).fen();
  return { version: GAME_TREE_VERSION, rootId: "n0", nodes: { n0: { id: "n0", fen, incomingEdgeId: null, primaryEdgeId: null, childEdgeIds: [] } }, edges: {} };
}

export type AppendOptions = { primary?: boolean; edgeId?: string; childId?: string; pathKey?: string };
export function appendGameStructureMove(tree: GameStructure, parentId: string, value: GameStructureMoveInput, options: AppendOptions = {}): GameStructureEdge {
  const parent = tree.nodes[parentId];
  if (!parent) throw new Error(`Unknown parent node: ${parentId}`);
  const uci = String(value.uci || "").toLowerCase();
  if (!UCI_MOVE.test(uci)) throw new Error(`Invalid UCI move: ${uci || "missing"}`);
  const existing = parent.childEdgeIds.map(id => tree.edges[id]).find(edge => edge?.uci === uci);
  if (existing) return existing;
  const occupied = new Set(Object.values(tree.edges).map(edge => edge.linkId));
  const requestedLink = LINK_ID.test(String(value.linkId || "")) && !occupied.has(String(value.linkId)) ? String(value.linkId) : "";
  const native = createStructuralRuntime(tree, Chess, {
    availableId(prefix: string, digest: string, records: Record<string, unknown>) {
      const requested = prefix === "ep1_" ? options.edgeId : options.childId;
      return requested && !records[requested] ? requested : runtime().treeAvailablePathId(prefix, digest, records);
    },
    link() {
      const path = [...pathEdgesToNode(tree, parentId).map(edge => edge.uci), uci];
      const digest = deterministicTreeEdgeId(tree.nodes[tree.rootId].fen, path).slice(4);
      const edgeId = options.edgeId && !tree.edges[options.edgeId] ? options.edgeId : runtime().treeAvailablePathId("ep1_", digest, tree.edges);
      return linkIdForPath(options.pathKey || `${parentId}/${uci}/${edgeId}`, occupied);
    },
  });
  const edge = native.treeAppendMove(parentId, { uci, san: String(value.san || uci).slice(0, 32), linkId: requestedLink, nags: stringList(value.nags), comments: stringList(value.comments) }, options.primary) as GameStructureEdge;
  return edge;
}
export function gameStructureFromSequence(
  mainline: StructureSequenceMove[],
  startFen = START_FEN,
) {
  const tree = createGameStructure(startFen);

  function addSequence(parentId: string, sequence: StructureSequenceMove[], primary: boolean, path: string[]) {
    let currentParent = parentId;
    sequence.forEach((source, index) => {
      const edge = appendGameStructureMove(tree, currentParent, source, {
        primary,
        pathKey: [...path, `${index}:${String(source.uci || "")}`].join("/"),
      });
      for (const variation of source.variations || []) {
        addSequence(currentParent, variation, false, [...path, `${index}:${edge.uci}`, "variation"]);
      }
      currentParent = edge.childId;
    });
  }

  addSequence(tree.rootId, mainline, true, ["main"]);
  return tree;
}

export function primaryLineEdges<Edge extends GameStructureEdge>(tree: GameStructure<Edge>): Edge[] { return runtime(tree).treePrimaryEdges(tree); }
export function nodeAtPrimaryPly(tree: GameStructure, ply: number) { return runtime(tree).treeNodeAtPrimaryPly(tree, ply); }
export function pathEdgesToNode<Edge extends GameStructureEdge>(tree: GameStructure<Edge>, nodeId: string): Edge[] { return runtime(tree).treePathEdgesToNode(tree, nodeId); }
export function findTreeEdgeByLinkId<Edge extends GameStructureEdge>(tree: GameStructure<Edge>, linkId: string): Edge | null { return runtime(tree).treeFindEdgeByLinkId(linkId); }
export function promoteTreeEdge(tree: GameStructure, edgeId: string): boolean { return runtime(tree).treePromoteEdge(edgeId); }
export function deleteTreeEdge(tree: GameStructure, edgeId: string): boolean { return runtime(tree).treeDeleteEdge(edgeId); }
export function treeMoveSignature(tree: GameStructure) { return primaryLineEdges(tree).map(edge => edge.uci).join(" "); }

/** Exact occurrence identity never collapses transposed or repeated positions. */
export function treeOccurrence(tree: GameStructure, nodeId: string) {
  if (!tree.nodes[nodeId]) throw new Error(`Unknown game-tree node: ${nodeId}`);
  return { rootFen: tree.nodes[tree.rootId].fen, moves: pathEdgesToNode(tree, nodeId).map(edge => edge.uci) };
}

/** Detach just structural fields, dropping every host extension. */
export function detachedGameStructureSnapshot(tree: GameStructure): GameStructure {
  return { version: GAME_TREE_VERSION, rootId: tree.rootId,
    nodes: Object.fromEntries(Object.entries(tree.nodes).map(([id, node]) => [id, { id: node.id, fen: node.fen, incomingEdgeId: node.incomingEdgeId, primaryEdgeId: node.primaryEdgeId, childEdgeIds: [...node.childEdgeIds] }])),
    edges: Object.fromEntries(Object.entries(tree.edges).map(([id, edge]) => [id, { id: edge.id, parentId: edge.parentId, childId: edge.childId, linkId: edge.linkId, san: edge.san, uci: edge.uci, from: edge.from, to: edge.to, promotion: edge.promotion, color: edge.color, fen_after: edge.fen_after, nags: [...edge.nags], comments: [...edge.comments] }])),
  };
}

export function normalizedGameStructure(value: unknown, startFen = START_FEN): GameStructure {
  if (!value || typeof value !== "object") return createGameStructure(startFen);
  const raw = value as Partial<GameStructure>;
  if (Number(raw.version) !== GAME_TREE_VERSION || !raw.nodes || !raw.edges || !raw.rootId) return createGameStructure(startFen);
  const tree = createGameStructure(raw.nodes[raw.rootId]?.fen || startFen);
  if (NODE_ID.test(raw.rootId) && raw.rootId !== tree.rootId) {
    const root = tree.nodes[tree.rootId]; delete tree.nodes[tree.rootId]; root.id = raw.rootId; tree.rootId = raw.rootId; tree.nodes[raw.rootId] = root;
  }
  const usedLinks = new Set<string>();
  function rebuild(rawNodeId: string, targetNodeId: string, path: string[], ancestors: Set<string>) {
    if (ancestors.has(rawNodeId)) return;
    const rawNode = raw.nodes?.[rawNodeId];
    if (!rawNode || !Array.isArray(rawNode.childEdgeIds)) return;
    const nextAncestors = new Set(ancestors).add(rawNodeId);
    for (const rawEdgeId of rawNode.childEdgeIds) {
      const rawEdge = raw.edges?.[rawEdgeId];
      if (!rawEdge || rawEdge.parentId !== rawNodeId || !raw.nodes?.[rawEdge.childId] || nextAncestors.has(rawEdge.childId)) continue;
      try {
        const requested = LINK_ID.test(String(rawEdge.linkId || "")) && !usedLinks.has(String(rawEdge.linkId)) ? String(rawEdge.linkId) : "";
        if (requested) usedLinks.add(requested);
        const edge = appendGameStructureMove(tree, targetNodeId, { ...rawEdge, linkId: requested }, { primary: rawNode.primaryEdgeId === rawEdgeId, edgeId: EDGE_ID.test(rawEdgeId) ? rawEdgeId : undefined, childId: NODE_ID.test(rawEdge.childId) ? rawEdge.childId : undefined, pathKey: [...path, rawEdge.uci].join("/") });
        rebuild(rawEdge.childId, edge.childId, [...path, edge.uci], nextAncestors);
      } catch { /* Invalid moves and their descendants are discarded. */ }
    }
  }
  rebuild(raw.rootId, tree.rootId, ["root"], new Set());
  return tree;
}
