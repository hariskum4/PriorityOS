/**
 * Fails the build on a hook that an earlier return can skip.
 *
 * This exists because of one bug that reached a person's screen: the Today
 * screen returns early when the record has not arrived yet, and a `useQuery`
 * added later sat below that return. On any cold start — empty cache, slow
 * network, an error — React counted one number of hooks on the first render
 * and a larger one on the next, then tore the whole screen down with
 * "Rendered fewer hooks than expected". Today's own tests passed throughout;
 * a typecheck cannot see it; it only appears when the data is genuinely
 * missing on first paint, which is exactly the case a developer with a warm
 * cache never hits.
 *
 * The rule enforced here is React's own: every hook must run on every render
 * of its component. Blocks (if/for) do not matter — a nested function does,
 * since it is its own hook scope — so this walks the AST rather than
 * counting braces. An earlier line-based version of this check reported the
 * codebase clean while the bug was still in it.
 *
 * Run: npm run check:hooks
 */
import ts from 'typescript';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const files = execSync('find app src -name "*.tsx"', { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);

const findings = [];

/** A component is anything PascalCase that could hold hooks. */
const isComponent = (n) =>
  (ts.isFunctionDeclaration(n) && n.name && /^[A-Z]/.test(n.name.text))
  || ((ts.isArrowFunction(n) || ts.isFunctionExpression(n))
      && ts.isVariableDeclaration(n.parent)
      && ts.isIdentifier(n.parent.name)
      && /^[A-Z]/.test(n.parent.name.text));

const isFunctionLike = (n) =>
  ts.isFunctionDeclaration(n) || ts.isArrowFunction(n)
  || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n);

for (const file of files) {
  const src = ts.createSourceFile(
    file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
  );
  const lineOf = (n) => src.getLineAndCharacterOfPosition(n.getStart()).line + 1;

  const scan = (body, name) => {
    let returnedAt = null;
    const walk = (node) => {
      /* A nested function is its own hook scope: its returns cannot skip the
         outer component's hooks, and its hooks are checked when we reach it. */
      if (isFunctionLike(node)) return;
      if (ts.isReturnStatement(node) && returnedAt === null) returnedAt = lineOf(node);
      if (ts.isCallExpression(node)
          && ts.isIdentifier(node.expression)
          && /^use[A-Z]/.test(node.expression.text)
          && returnedAt !== null) {
        findings.push(
          `${file}:${lineOf(node)}  ${node.expression.text}() can be skipped — `
          + `${name} may return at line ${returnedAt}`,
        );
      }
      ts.forEachChild(node, walk);
    };
    ts.forEachChild(body, walk);
  };

  const visit = (node) => {
    if (isComponent(node) && node.body) {
      scan(node.body, ts.isFunctionDeclaration(node) ? node.name.text : node.parent.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
}

if (findings.length) {
  console.error('Conditional hooks — these crash the screen when the early return fires:\n');
  for (const f of findings) console.error(`  ${f}`);
  console.error('\nMove every hook above the component\'s first return.');
  process.exit(1);
}
console.log(`Hook order clean across ${files.length} files.`);
