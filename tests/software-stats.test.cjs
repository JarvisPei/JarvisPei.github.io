const assert = require('node:assert/strict');
const test = require('node:test');
const { modelTotals, nextPage, validCount } = require('../software-stats.js');

test('sums all-time downloads across official formats and separates families', () => {
  const totals = modelTotals([
    { id: 'TokenRhythm/NeoHorse-1-4B', downloadsAllTime: 1000, downloads: 10 },
    { id: 'TokenRhythm/NeoHorse-1-9B', downloadsAllTime: 500 },
    { id: 'TokenRhythm/NeoHorse-1-4B-GGUF', downloadsAllTime: 200 },
    { id: 'TokenRhythm/NeoHorse-1-9B-MLX-8bit', downloadsAllTime: 100 },
    { id: 'TokenRhythm/NeoHorse-Jev-4B', downloadsAllTime: 300 },
    { id: 'TokenRhythm/NeoHorse-Jev-4B-GGUF', downloadsAllTime: 400 },
    { id: 'someone/NeoHorse-1-4B-GGUF', downloadsAllTime: 9999 },
    { id: 'TokenRhythm/OtherModel', downloadsAllTime: 9999 },
    { id: 'TokenRhythm/NeoHorse-1-4B-private', private: true, downloadsAllTime: 9999 },
    { id: 'TokenRhythm/NeoHorse-1-4B-disabled', disabled: true, downloadsAllTime: 9999 }
  ]);
  assert.equal(totals['neohorse-1'].value, 1800);
  assert.equal(totals['neohorse-1'].repos.length, 4);
  assert.equal(totals['neohorse-jev'].value, 700);
});

test('does not silently use monthly downloads or publish incomplete family totals', () => {
  const totals = modelTotals([
    { id: 'TokenRhythm/NeoHorse-1-4B', downloadsAllTime: 100 },
    { id: 'TokenRhythm/NeoHorse-1-9B', downloads: 200 },
    { id: 'TokenRhythm/NeoHorse-Jev-4B', downloadsAllTime: 300 }
  ]);
  assert.equal(totals['neohorse-1'], undefined);
  assert.equal(totals['neohorse-jev'].value, 300);
});

test('deduplicates paginated repositories and preserves genuine zero counts', () => {
  const model = { id: 'TokenRhythm/NeoHorse-1-4B', downloadsAllTime: 0 };
  const totals = modelTotals([model, model]);
  assert.equal(totals['neohorse-1'].value, 0);
  assert.equal(totals['neohorse-1'].repos.length, 1);
  assert.deepEqual(modelTotals([]), {});
  assert.throws(() => modelTotals({ error: 'rate limited' }));
});

test('validates counts instead of interpreting missing or malformed fields as zero', () => {
  for (const value of [null, undefined, '100', -1, 1.2, NaN, Infinity]) {
    assert.equal(validCount(value), false);
  }
  assert.equal(validCount(0), true);
  assert.equal(validCount(100), true);
});

test('reads only the next page from pagination links', () => {
  assert.equal(nextPage('<https://huggingface.co/api/models?cursor=abc>; rel="next"'), 'https://huggingface.co/api/models?cursor=abc');
  assert.equal(nextPage('<https://huggingface.co/api/models?cursor=abc>; rel=next'), 'https://huggingface.co/api/models?cursor=abc');
  assert.equal(nextPage('<https://huggingface.co/api/models?page=1>; rel="prev"'), null);
  assert.equal(nextPage(null), null);
});
