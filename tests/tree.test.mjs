import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameStructure, appendGameStructureMove, primaryLineEdges, pathEdgesToNode, treeOccurrence, promoteTreeEdge, deleteTreeEdge, deterministicTreeEdgeId, detachedGameStructureSnapshot, normalizedGameStructure, nodeAtPrimaryPly, findTreeEdgeByLinkId} from '@knights-eye-chess/game-tree/tree';
import {parsePgnTree, exportPgnTree} from '@knights-eye-chess/game-tree/pgn';
import {GAME_TREE_VERSION} from '@knights-eye-chess/game-tree/contracts';
function line(tree, parent, moves, primary = false) {return moves.map(uci => {const edge = appendGameStructureMove(tree, parent, {uci}, {primary}); parent = edge.childId; return edge;});}
function records(tree) {return Object.values(tree.edges).map(edge => ({path: treeOccurrence(tree, edge.childId).moves.join(','), san: edge.san, nags: edge.nags, comments: edge.comments, primary: tree.nodes[edge.parentId].primaryEdgeId === edge.id})).sort((a,b) => a.path.localeCompare(b.path));}

test('KE-TREE-001/002: nested PGN round trip retains ordered occurrences and annotations', () => {
 const parsed = parsePgnTree('[Event "A \\"quoted\\" game"]\n\n1. e4 {principal} (1. d4 $1 d5 (1... Nf6 2. c4) 2. c4) e5 (1... c5 2. Nf3 (2. Nc3)) 2. Nf3! *');
 const restored = parsePgnTree(exportPgnTree(parsed.gameTree, parsed.headers));
 assert.equal(restored.headers.Event, 'A "quoted" game'); assert.deepEqual(records(restored.gameTree), records(parsed.gameTree));
 assert.deepEqual(Object.keys(parsed.gameTree).sort(), ['edges','nodes','rootId','version']); assert.ok(Object.values(parsed.gameTree.edges).every(edge => !('analysis' in edge)));
});
test('KE-TREE-002: custom black-to-move root owns FEN metadata and numbering', () => {
 const fen = '4k3/8/8/8/8/8/4P3/4K3 b - - 0 17', parsed = parsePgnTree(`[FEN "${fen}"]\n\n17... Kd7 (17... Kf7) 18. e4 *`);
 const output = exportPgnTree(parsed.gameTree, {...parsed.headers, FEN:'corrupt'});
 assert.match(output,/17\.\.\. Kd7 \(17\.\.\. Kf7\) 18\. e4/); assert.match(output,/\[SetUp "1"\]/);
 const restored = parsePgnTree(output); assert.equal(restored.startFen,fen); assert.deepEqual(records(restored.gameTree),records(parsed.gameTree));
});
test('KE-TREE-002: en passant, castling, promotion and result survive round trip', () => {
 const parsed = parsePgnTree('[Result "1-0"]\n[FEN "4k2r/P6p/8/3pP3/8/8/8/4K2R w Kk d6 0 1"]\n\n1. exd6! Kd7 (1... O-O) 2. a8=Q 1-0');
 const restored = parsePgnTree(exportPgnTree(parsed.gameTree, parsed.headers)); assert.equal(restored.headers.Result,'1-0'); assert.deepEqual(records(restored.gameTree),records(parsed.gameTree));
});
test('KE-TREE-001: promotion/deletion retain sibling order and nested continuations', () => {
 const tree = parsePgnTree('1. e4 e5 (1... c5 2. Nf3 (2. Nc3)) (1... e6 2. d4) 2. Nf3 *').gameTree, main=primaryLineEdges(tree), branch=Object.values(tree.edges).find(edge=>edge.uci==='c7c5');
 assert.equal(promoteTreeEdge(tree,branch.id),true); assert.deepEqual(primaryLineEdges(tree).map(edge=>edge.uci),['e2e4','c7c5','g1f3']);
 assert.equal(deleteTreeEdge(tree,branch.id),true); assert.deepEqual(primaryLineEdges(tree).map(edge=>edge.uci),['e2e4','e7e6','d2d4']); assert.ok(tree.edges[main[1].id]);
 assert.ok(Object.values(tree.edges).every(edge=>tree.nodes[edge.childId])); assert.deepEqual(records(parsePgnTree(exportPgnTree(tree)).gameTree),records(tree));
});
test('KE-TREE-001: transposed equal FENs retain exact separate root histories', () => {
 const tree=createGameStructure(), first=line(tree,tree.rootId,['g1f3','g8f6','b1c3','b8c6'],true), second=line(tree,tree.rootId,['b1c3','b8c6','g1f3','g8f6']);
 assert.equal(tree.nodes[first.at(-1).childId].fen,tree.nodes[second.at(-1).childId].fen); assert.notEqual(first.at(-1).id,second.at(-1).id);
 assert.notDeepEqual(treeOccurrence(tree,first.at(-1).childId),treeOccurrence(tree,second.at(-1).childId));
 assert.deepEqual(pathEdgesToNode(tree,second.at(-1).childId).map(edge=>edge.uci),['b1c3','b8c6','g1f3','g8f6']); assert.equal(nodeAtPrimaryPly(tree,4).id,first.at(-1).childId); assert.equal(findTreeEdgeByLinkId(tree,second[0].linkId).id,second[0].id);
});
test('KE-TREE-001: repeated board positions retain occurrences and recreate stable IDs', () => {
 const tree=createGameStructure(), edges=line(tree,tree.rootId,['g1f3','g8f6','f3g1','f6g8','g1f3','g8f6','f3g1','f6g8'],true);
 assert.equal(new Set(edges.map(edge=>edge.id)).size,8); assert.notEqual(edges[0].id,edges[4].id); assert.equal(treeOccurrence(tree,edges[4].childId).moves.length,5);
 const id=edges[4].id,parent=edges[4].parentId; assert.equal(deleteTreeEdge(tree,id),true); const restored=appendGameStructureMove(tree,parent,{uci:'g1f3'}); assert.equal(restored.id,id);
 assert.equal(restored.id,deterministicTreeEdgeId(tree.nodes[tree.rootId].fen,treeOccurrence(tree,restored.childId).moves));
});
test('KE-TREE-001/002: normalization replays legal structure; snapshots strip host extensions', () => {
 const tree=parsePgnTree('1. e4 {retained} e5 (1... c5) *').gameTree,edge=primaryLineEdges(tree)[0]; tree.classifierVersion=40; tree.positionEvidence={engine:'FORBIDDEN'};edge.analysis={classification:'FORBIDDEN'};edge.reasoningTransient=true;
 const snapshot=detachedGameStructureSnapshot(tree);assert.doesNotMatch(JSON.stringify(snapshot),/FORBIDDEN|analysis|classifierVersion|positionEvidence|reasoningTransient/);assert.notEqual(snapshot.nodes[tree.rootId].childEdgeIds,tree.nodes[tree.rootId].childEdgeIds);
 const restored=normalizedGameStructure(snapshot);assert.equal(restored.version,GAME_TREE_VERSION);assert.deepEqual(records(restored),records(tree));
 const invalid=structuredClone(snapshot);invalid.edges[edge.id].uci='e2e5';assert.equal(Object.keys(normalizedGameStructure(invalid).edges).length,0);
});
test('KE-TREE-001/002: duplicate append retains metadata; illegal moves/malformed PGN reject', () => {
 const tree=createGameStructure(),edge=appendGameStructureMove(tree,tree.rootId,{uci:'e2e4',comments:['keep']});assert.equal(appendGameStructureMove(tree,tree.rootId,{uci:'e2e4',comments:['replace']}),edge);assert.deepEqual(edge.comments,['keep']);assert.throws(()=>appendGameStructureMove(tree,tree.rootId,{uci:'e2e5'}));
 assert.throws(()=>parsePgnTree('1. e4 (1. d4 *'),/Unclosed/);assert.throws(()=>parsePgnTree('1. e4 ) *'),/Unexpected/);const empty=parsePgnTree('*');assert.equal(primaryLineEdges(empty.gameTree).length,0);assert.equal(primaryLineEdges(parsePgnTree(exportPgnTree(empty.gameTree)).gameTree).length,0);
});
