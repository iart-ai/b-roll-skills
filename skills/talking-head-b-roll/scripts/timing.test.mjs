import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../templates/b-roll.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function page(fps, lead) {
  const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({ width: 10 }) : () => {} });
  const canvas = { getContext: () => ctx };
  const sandbox = {
    window: {}, location: { search: '?render=1' }, URLSearchParams,
    console: { warn() {} },
    document: {
      documentElement: { style: { setProperty() {} } },
      querySelector: () => canvas,
      fonts: { load: async () => [], ready: Promise.resolve() },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(script.replace('const FPS = 30', `const FPS = ${fps}`)
    .replace('VISUAL_LEAD_FRAMES = 6', `VISUAL_LEAD_FRAMES = ${lead}`), sandbox);
  // Keep the real timing machinery; capture its input instead of drawing placeholder graphics.
  vm.runInContext('for (const sc of SCENES) sc.draw = (t, s) => { window.last = {t, ...s}; };', sandbox);
  return sandbox;
}

for (const fps of [25, 30, 60]) {
  test(`graphics advance exactly six frames at ${fps} fps`, () => {
    const baseline = page(fps, 0), early = page(fps, 6);
    const start = 3 * fps;
    early.window.draw(start - 7);
    assert.equal(early.window.last, undefined);
    early.window.draw(start - 6);
    baseline.window.draw(start);
    assert.deepEqual(JSON.parse(JSON.stringify(early.window.last)), JSON.parse(JSON.stringify(baseline.window.last)));
    early.window.draw(4 * fps - 6);
    baseline.window.draw(4 * fps);
    assert.equal(early.window.last.now, baseline.window.last.now);
    assert.equal(early.window.FRAMES, baseline.window.FRAMES);
    assert.equal(early.window.VIDEO, baseline.window.VIDEO);
    assert.equal(early.window.SCENES[0].from, 3 - 6 / fps);
    assert.equal(early.window.SCENES[0].speechFrom, 3);
    assert.equal(early.window.SCENES[0].speechTo, 7.5);
    early.window.last = undefined;
    early.window.draw(Math.ceil(7.5 * fps) - 6);
    assert.equal(early.window.last, undefined);
  });
}

test('zero lead preserves the original scene times', () => {
  const p = page(25, 0);
  assert.equal(p.window.SCENES[0].from, 3);
  assert.equal(p.window.SCENES[0].to, 7.5);
  p.window.draw(74);
  assert.equal(p.window.last, undefined);
  p.window.draw(75);
  assert.equal(p.window.last.now, 3);
});
