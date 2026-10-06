import { Chess } from "chess.js";
import { gameStructureFromSequence, START_FEN } from "./tree";
import type { GameStructure } from "./contracts";

export type PgnTreeMove = {
  san: string;
  uci: string;
  color: string;
  fen_before: string;
  fen_after: string;
  nags: string[];
  comments: string[];
  variations: PgnTreeMove[][];
};


function headersFromPgn(pgn: string) {
  const headers: Record<string, string> = {};
  for (const match of pgn.matchAll(/^\s*\[([^\s]+)\s+"((?:\\.|[^"])*)"\]\s*$/gm)) {
    headers[match[1]] = match[2]
      .replace(/\\([\\"])/g, "$1")
      .replace(/\\([_*\[\]()~`>#+\-=|{}.!])/g, "$1");
  }
  return headers;
}

function tokensFromPgn(pgn: string) {
  const movetext = pgn.replace(/^\s*\[[^\r\n]*\]\s*$/gm, " ");
  return movetext.match(/\{[^}]*\}|;[^\r\n]*|\(|\)|\$\d+|1-0|0-1|1\/2-1\/2|\*|[^\s(){}]+/g) || [];
}

function cleanMoveToken(value: string) {
  let token = value.replace(/^\d+\.(?:\.\.)?/, "");
  if (!token || /^\.+$/.test(token)) return null;
  const glyph = /([!?]{1,2})$/.exec(token)?.[1] || "";
  if (glyph) token = token.slice(0, -glyph.length);
  return { san: token, glyph };
}

export function parsePgnTree(pgn: string, options: { allowEmpty?: boolean } = {}) {
  const headers = headersFromPgn(pgn);
  // Some exporters supply FEN without SetUp. Never silently use the normal board.
  const startFen = headers.FEN || START_FEN;
  if (headers.FEN) headers.SetUp = "1";
  const tokens = tokensFromPgn(pgn);
  let cursor = 0;

  function sequence(chess: Chess, nested: boolean): PgnTreeMove[] {
    const nodes: PgnTreeMove[] = [];
    let last: PgnTreeMove | null = null;
    while (cursor < tokens.length) {
      const raw = tokens[cursor++];
      if (raw === ")") {
        if (!nested) throw new Error("Unexpected closing parenthesis in PGN");
        return nodes;
      }
      if (raw === "(") {
        if (!last) throw new Error("A PGN variation has no parent move");
        last.variations.push(sequence(new Chess(last.fen_before), true));
        continue;
      }
      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(raw)) continue;
      if (raw.startsWith("{") || raw.startsWith(";")) {
        if (last) last.comments.push(raw.startsWith("{") ? raw.slice(1, -1).trim() : raw.slice(1).trim());
        continue;
      }
      if (/^\$\d+$/.test(raw)) {
        if (last) last.nags.push(raw);
        continue;
      }
      const cleaned = cleanMoveToken(raw);
      if (!cleaned) continue;
      const before = chess.fen();
      let move;
      try {
        move = chess.move(cleaned.san, { strict: false });
      } catch {
        throw new Error(`Invalid PGN move “${raw}” near ply ${nodes.length + 1}`);
      }
      if (!move) throw new Error(`Invalid PGN move “${raw}”`);
      last = {
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion || ""}`,
        color: move.color,
        fen_before: before,
        fen_after: chess.fen(),
        nags: cleaned.glyph ? [cleaned.glyph] : [],
        comments: [],
        variations: [],
      };
      nodes.push(last);
    }
    if (nested) throw new Error("Unclosed PGN variation");
    return nodes;
  }

  const tree = sequence(new Chess(startFen), false);
  if (!tree.length && !options.allowEmpty && !headers.FEN && !tokens.some(token => /^(1-0|0-1|1\/2-1\/2|\*)$/.test(token))) {
    throw new Error("PGN must contain moves or a game result marker");
  }
  const gameTree = gameStructureFromSequence(tree, startFen);
  return { headers, startFen, gameTree };
}

/** Export canonical structure as standard recursive annotation variations.
 * Root position owns FEN metadata and absolute move numbering. */
export function exportPgnTree(tree: GameStructure, headers: Record<string, string> = {}, options: { result?: string } = {}) {
  const root = tree.nodes[tree.rootId];
  if (!root) throw new Error("Cannot export a game tree without its root");
  const metadata = { ...headers };
  const result = options.result || metadata.Result || "*";
  if (!/^(1-0|0-1|1\/2-1\/2|\*)$/.test(result)) throw new Error(`Invalid PGN result: ${result}`);
  if (root.fen !== START_FEN) { metadata.SetUp = "1"; metadata.FEN = root.fen; }
  else { delete metadata.SetUp; delete metadata.FEN; }
  metadata.Result = result;
  const active = new Set<string>();
  function sequence(nodeId: string, selected?: string): string {
    const output: string[] = [];
    let node = tree.nodes[nodeId], first = true;
    const touched: string[] = [];
    while (node) {
      const edgeId = first && selected ? selected : node.primaryEdgeId;
      const edge = edgeId && tree.edges[edgeId];
      if (!edge) break;
      if (active.has(edge.id)) throw new Error("Cannot export a cyclic game tree");
      active.add(edge.id); touched.push(edge.id);
      const fields = node.fen.split(/\s+/), number = Number(fields[5]) || 1, black = fields[1] === "b";
      const prefix = !black ? `${number}. ` : first ? `${number}... ` : "";
      const glyphs = edge.nags.filter(nag => /^[!?]{1,2}$/.test(nag)).join("");
      const annotations = [...edge.nags.filter(nag => !/^[!?]{1,2}$/.test(nag)), ...edge.comments.map(comment => `{${String(comment).replace(/}/g, "]")}}`)];
      output.push(prefix + edge.san + glyphs + (annotations.length ? " " + annotations.join(" ") : ""));
      if (!(first && selected)) {
        for (const alternativeId of node.childEdgeIds) {
          if (alternativeId !== edge.id && tree.edges[alternativeId]) output.push(`(${sequence(node.id, alternativeId)})`);
        }
      }
      node = tree.nodes[edge.childId]; first = false;
    }
    for (const edgeId of touched) active.delete(edgeId);
    return output.join(" ");
  }
  const escape = (value: string) => String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const headerText = Object.entries(metadata).map(([key, value]) => {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid PGN header: ${key}`);
    return `[${key} "${escape(value)}"]`;
  }).join("\n");
  return `${headerText}\n\n${sequence(tree.rootId)}${root.primaryEdgeId ? " " : ""}${result}`;
}
