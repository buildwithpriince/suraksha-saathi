import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

/**
 * Reanimated's worklet transform captures the functions a worklet calls when the worklet is
 * defined. A module-level worklet that calls a local function declared further down captures
 * `undefined` and throws "undefined is not a function" on the device, although plain JS hoisting
 * makes it work under Vitest. (This broke the training screen once: focalLengthPx called
 * shownStreamHeight, declared below it.) So: a worklet may only call local functions declared above it.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'generated' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

interface Declared {
  name: string;
  start: number;
  body: string;
}

/** Module-level `function name(...) { ... }` declarations with their bodies (brace matched). */
function functions(text: string): Declared[] {
  const found: Declared[] = [];
  const re = /^(?:export )?function (\w+)\s*[(<]/gm;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const open = text.indexOf('{', text.indexOf(')', m.index));
    let depth = 0;
    let end = open;
    for (; end < text.length; end++) {
      if (text[end] === '{') depth++;
      else if (text[end] === '}' && --depth === 0) break;
    }
    found.push({ name: m[1]!, start: m.index, body: text.slice(open, end + 1) });
  }
  return found;
}

test('worklets only call local functions declared above them', () => {
  const problems: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    const declared = functions(text);
    for (const fn of declared) {
      if (!/^\{\s*'worklet'/.test(fn.body)) continue;
      for (const other of declared) {
        if (other.start > fn.start && new RegExp(`\\b${other.name}\\(`).test(fn.body)) {
          problems.push(`${relative(SRC, file)}: worklet ${fn.name} calls ${other.name}, declared below it`);
        }
      }
    }
  }
  expect(problems).toEqual([]);
});
