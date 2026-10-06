/** Structure-only contracts; runtime evidence belongs to the host. */
export const GAME_TREE_VERSION = 1;
export type GameStructureMoveInput = {
  san?: unknown; uci?: unknown; color?: unknown; nags?: unknown; comments?: unknown; linkId?: unknown;
};
export type GameStructureEdge = {
  id: string;
  parentId: string;
  childId: string;
  linkId: string;
  san: string;
  uci: string;
  from: string;
  to: string;
  promotion: string;
  color: "w" | "b";
  fen_after: string;
  nags: string[];
  comments: string[];
};

export type GameTreeNode = {
  id: string;
  fen: string;
  incomingEdgeId: string | null;
  primaryEdgeId: string | null;
  childEdgeIds: string[];
};

export type GameStructure<Edge extends GameStructureEdge = GameStructureEdge> = {
  version: typeof GAME_TREE_VERSION;
  rootId: string;
  nodes: Record<string, GameTreeNode>;
  edges: Record<string, Edge>;
};

export type StructureSequenceMove = GameStructureMoveInput & { variations?: StructureSequenceMove[][] };
