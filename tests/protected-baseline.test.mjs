import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const baseline = JSON.parse(readFileSync(new URL('./protected-baseline.json', import.meta.url)));
test('motor, ponte e snapshots permanecem byte a byte no baseline autorizado', () => {
  for (const [path, hash] of Object.entries(baseline)) {
    const bytes = readFileSync(new URL('../' + path, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, path);
  }
});
