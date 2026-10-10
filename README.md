# Knight's Eye Game Tree

Store a chess game as a tree of legal moves, including nested variations, comments
and annotations. Import PGN, navigate a line, promote a variation and export PGN
again without losing the history that led to each move.

Game Tree is useful for study editors, game viewers and analysis apps. It uses
chess.js for legality; your app supplies the interface and decides how to save games.

## What you can build

- A PGN viewer that follows the main line or explores variations.
- A study editor with branch promotion, deletion and move comments.
- A game model that keeps repeated positions and transpositions as separate occurrences.
- A structural snapshot for your own storage or board component.

## Get started

Use Node 24 or newer. This is a preview package; npm publication has not been
performed. From a checkout of [this repository](https://github.com/knights-eye-chess/game-tree):

```sh
npm ci
npm run pack:checked
```

The command builds, tests and writes a versioned `.tgz` in `artifacts/`.
Install that archive in your app:

```sh
npm install /absolute/path/to/game-tree/artifacts/knights-eye-chess-game-tree-0.1.0-dev.6.tgz
```

Parse a game, inspect an occurrence and export its variations:

```js
import { parsePgnTree, exportPgnTree } from '@knights-eye-chess/game-tree/pgn';
import { primaryLineEdges, treeOccurrence } from '@knights-eye-chess/game-tree/tree';

const { gameTree, headers } = parsePgnTree('1. e4 e5 (1... c5) 2. Nf3 *');
const secondMove = primaryLineEdges(gameTree)[1];
console.log(treeOccurrence(gameTree, secondMove.childId));
// { rootFen: ..., moves: ['e2e4', 'e7e5'] }
console.log(exportPgnTree(gameTree, headers));
```

## Edit and navigate

Create a tree and append legal UCI moves:

```js
import { createGameStructure, appendGameStructureMove,
  primaryLineEdges } from '@knights-eye-chess/game-tree/tree';

const tree = createGameStructure();
const e4 = appendGameStructureMove(tree, tree.rootId,
  { uci: 'e2e4', comments: ['Control the centre'] }, { primary: true });
appendGameStructureMove(tree, e4.childId, { uci: 'e7e5' }, { primary: true });
console.log(primaryLineEdges(tree).map(edge => edge.san)); // ['e4', 'e5']
```

`promoteTreeEdge(tree, edgeId)` chooses the main continuation at that branch.
`deleteTreeEdge(tree, edgeId)` removes its subtree. `pathEdgesToNode` returns a
node's ordered history. Occurrences use the root FEN and full move path, so equal
board positions never merge different histories.

## API and limits

| Entry point | Purpose |
| --- | --- |
| `@knights-eye-chess/game-tree/tree` | Create, edit, navigate and detach structural snapshots. |
| `@knights-eye-chess/game-tree/pgn` | `parsePgnTree` and `exportPgnTree`. |
| `@knights-eye-chess/game-tree/contracts` | Structure types and `GAME_TREE_VERSION`. |

There is no root import. See [tree APIs](src/tree.ts), [PGN APIs](src/pgn.ts) and
[examples in tests](tests/tree.test.mjs).

PGN support includes legal nested variations, edge comments, symbolic annotations,
numeric NAGs and custom FEN roots. It normalizes formatting. Root/pre-move comments,
root NAGs and unknown PGN extensions are not represented. Export uses
`headers.Result` or `*` unless you supply a result; it does not infer the winner.

Snapshots include structural data. Your app owns analysis, classifications,
transient branches and persistence. The package's runtime dependency is chess.js
1.4.0; it does not need an engine or a board UI.

## Development

```sh
npm ci
npm run check
npm run pack:checked
```

Edit the source in this repository. [SOURCE-ORIGIN.json](SOURCE-ORIGIN.json)
records the historical extraction; current builds do not require the old application
checkout. Tests cover legal replay, variations, special moves and occurrence identity.

See [npm publishing](NPM-PUBLISHING.md) for release preparation.

## License

First-party code is **[MIT](LICENSE)**. See [licensing details](LICENSING.md) and
[third-party notices](THIRD_PARTY_NOTICES.md).
