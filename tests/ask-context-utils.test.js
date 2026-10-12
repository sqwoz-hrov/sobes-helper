const test = require('node:test');
const assert = require('node:assert/strict');
const {
    deriveContextTitle,
    makePlaceholderTitle,
    stripMarkdown,
    truncateUnicode,
} = require('../src/features/ask/contextUtils');

test('context titles are derived from the first meaningful Markdown line', () => {
    assert.equal(deriveContextTitle('\n## SQL query result\nMore detail', 'Quick Ask 1'), 'SQL query result');
    assert.equal(stripMarkdown('**Answer:** [documentation](https://example.com)'), 'Answer: documentation');
});

test('context titles truncate by Unicode code point and retain a fallback', () => {
    assert.equal(truncateUnicode('😀😀😀😀', 3), '😀😀…');
    assert.equal(deriveContextTitle('', 'Screenshot 2'), 'Screenshot 2');
    assert.equal(makePlaceholderTitle('screenshot', 3), 'Screenshot 3');
    assert.equal(makePlaceholderTitle('quick_ask', 4), 'Quick Ask 4');
});
