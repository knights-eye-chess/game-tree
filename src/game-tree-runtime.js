/** Canonical executable structural operations. The marked declarations also
 * generate the unchanged widget compatibility fragment. window is a local
 * chess.js port, never a browser dependency. Hooks are supplied by the host. */
export function createStructuralRuntime(gameTree, Chess, overrides = {}) {
  var window = {ChessJs: {Chess: Chess}};
  function normalizedFen(value){return String(value||'').trim().replace(/\s+/g,' ')}
  function moveUci(move){return String(move&&move.uci||'').toLowerCase()}
  function treeRefreshMove(edge){return edge}
  function syncTreeViews(){}
  var treeRandomLinkId = overrides.link;
// BEGIN TREE DECLARATION treePrimaryEdges
    function treePrimaryEdges(tree){var output=[],node=tree&&tree.nodes[tree.rootId],seen={};while(node&&node.primaryEdgeId&&!seen[node.primaryEdgeId]){seen[node.primaryEdgeId]=true;var edge=tree.edges[node.primaryEdgeId];if(!edge)break;output.push(edge);node=tree.nodes[edge.childId]}return output}
// END TREE DECLARATION treePrimaryEdges
// BEGIN TREE DECLARATION treeNodeAtPrimaryPly
    function treeNodeAtPrimaryPly(tree,target){var node=tree&&tree.nodes[tree.rootId],count=Math.max(0,Number(target)||0);for(var i=0;node&&i<count;i++){var edge=node.primaryEdgeId&&tree.edges[node.primaryEdgeId];if(!edge)return null;node=tree.nodes[edge.childId]}return node||null}
// END TREE DECLARATION treeNodeAtPrimaryPly
// BEGIN TREE DECLARATION treePathEdgesToNode
    function treePathEdgesToNode(tree,nodeId){var output=[],node=tree&&tree.nodes[nodeId],seen={};while(node&&node.incomingEdgeId&&!seen[node.incomingEdgeId]){seen[node.incomingEdgeId]=true;var edge=tree.edges[node.incomingEdgeId];if(!edge)break;output.push(edge);node=tree.nodes[edge.parentId]}return output.reverse()}
// END TREE DECLARATION treePathEdgesToNode
// BEGIN TREE DECLARATION treeFindChildEdge
    function treeFindChildEdge(parentId,uci){var parent=gameTree&&gameTree.nodes[parentId];if(!parent)return null;for(var i=0;i<parent.childEdgeIds.length;i++){var edge=gameTree.edges[parent.childEdgeIds[i]];if(edge&&edge.uci===uci)return edge}return null}
// END TREE DECLARATION treeFindChildEdge
// BEGIN TREE DECLARATION treeFindEdgeByLinkId
    function treeFindEdgeByLinkId(linkId){var ids=Object.keys(gameTree&&gameTree.edges||{});for(var i=0;i<ids.length;i++){var edge=gameTree.edges[ids[i]];if(edge&&edge.linkId===linkId)return edge}return null}
// END TREE DECLARATION treeFindEdgeByLinkId
// BEGIN TREE DECLARATION treeAllocateId
    function treeAllocateId(prefix,records){var index=Object.keys(records||{}).length;while(records[prefix+index])index++;return prefix+index}
// END TREE DECLARATION treeAllocateId
// BEGIN TREE DECLARATION treeHash32
    function treeHash32(value){var hash=2166136261;for(var i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}return hash>>>0}
// END TREE DECLARATION treeHash32
// BEGIN TREE DECLARATION treePathDigest
    function treePathDigest(startFen,moves){var path=normalizedFen(startFen)+'\n'+moves.map(function(move){return String(move).toLowerCase()}).join(','),out='';['0','1','2','3'].forEach(function(domain){out+=treeHash32(domain+'\0'+path).toString(16).padStart(8,'0')});return out}
// END TREE DECLARATION treePathDigest
// BEGIN TREE DECLARATION treeAvailablePathId
    function treeAvailablePathId(prefix,digest,records){var base=prefix+digest;if(!records[base])return base;var attempt=1;while(records[base+'_'+attempt])attempt++;return base+'_'+attempt}
// END TREE DECLARATION treeAvailablePathId
// BEGIN TREE DECLARATION treeAppendMove
    function treeAppendMove(parentId,move,primary){var existing=treeFindChildEdge(parentId,moveUci(move));if(existing)return treeRefreshMove(existing);var parent=gameTree&&gameTree.nodes[parentId];if(!parent)throw new Error('Unknown game-tree parent '+parentId);var u=moveUci(move),chess=new window.ChessJs.Chess(parent.fen),played=chess.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u.slice(4)||'q'});if(!played)throw new Error('Illegal game-tree move '+u);var path=treePathEdgesToNode(gameTree,parentId).map(moveUci).concat([u]),digest=treePathDigest(gameTree.nodes[gameTree.rootId].fen,path),edgeId=treeAvailablePathId('ep1_',digest,gameTree.edges),childId=treeAvailablePathId('np1_',digest,gameTree.nodes),edge={id:edgeId,parentId:parentId,childId:childId,linkId:move.linkId||treeRandomLinkId(),san:played.san||move.san||u,uci:u,from:played.from,to:played.to,promotion:played.promotion||'',color:played.color,fen_after:chess.fen(),nags:move.nags||[],comments:move.comments||[]};gameTree.edges[edgeId]=edge;gameTree.nodes[childId]={id:childId,fen:chess.fen(),incomingEdgeId:edgeId,primaryEdgeId:null,childEdgeIds:[]};parent.childEdgeIds.push(edgeId);if(primary||!parent.primaryEdgeId)parent.primaryEdgeId=edgeId;syncTreeViews();return treeRefreshMove(edge)}
// END TREE DECLARATION treeAppendMove
// BEGIN TREE DECLARATION treePromoteEdge
    function treePromoteEdge(edgeId){var edge=gameTree&&gameTree.edges[edgeId],parent=edge&&gameTree.nodes[edge.parentId];if(!edge||!parent)return false;parent.primaryEdgeId=edgeId;syncTreeViews();return true}
// END TREE DECLARATION treePromoteEdge
// BEGIN TREE DECLARATION treeDeleteEdge
    function treeDeleteEdge(edgeId){var edge=gameTree&&gameTree.edges[edgeId];if(!edge)return false;function remove(id){var item=gameTree.edges[id],child=item&&gameTree.nodes[item.childId];if(child)child.childEdgeIds.slice().forEach(remove);if(item){delete gameTree.nodes[item.childId];delete gameTree.edges[id]}}var parent=gameTree.nodes[edge.parentId],siblingIndex=parent?parent.childEdgeIds.indexOf(edgeId):-1,promotedSibling=parent&&parent.primaryEdgeId===edgeId?(parent.childEdgeIds[siblingIndex+1]||parent.childEdgeIds[siblingIndex-1]||null):null;remove(edgeId);if(parent){parent.childEdgeIds=parent.childEdgeIds.filter(function(id){return id!==edgeId});if(parent.primaryEdgeId===edgeId)parent.primaryEdgeId=promotedSibling}syncTreeViews();return true}
// END TREE DECLARATION treeDeleteEdge
  if (overrides.availableId) treeAvailablePathId = overrides.availableId;
  return {treePrimaryEdges, treeNodeAtPrimaryPly, treePathEdgesToNode, treeFindChildEdge, treeFindEdgeByLinkId, treeAllocateId, treeHash32, treePathDigest, treeAvailablePathId, treeAppendMove, treePromoteEdge, treeDeleteEdge};
}
