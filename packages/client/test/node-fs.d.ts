// The client's tsconfig carries no Node types, so the browser code cannot reach
// for Node by mistake. A test that reads a file of the package says so here.
declare module 'node:fs' {
  export function readFileSync(path: URL, encoding: 'utf8'): string;
}
