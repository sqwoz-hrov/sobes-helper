const test = require('node:test');
const assert = require('node:assert/strict');
const { convertMessagesToGeminiContents } = require('../src/features/common/ai/providers/gemini');

test('Gemini conversion retains full multi-turn and screenshot history', () => {
    const contents = convertMessagesToGeminiContents([
        { role: 'system', content: 'system' },
        {
            role: 'user',
            content: [
                { type: 'text', text: 'Inspect this' },
                { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,YWJj' } },
            ],
        },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Follow up' },
    ]);

    assert.deepEqual(contents.map(item => item.role), ['user', 'model', 'user']);
    assert.equal(contents[0].parts[0].text, 'Inspect this');
    assert.deepEqual(contents[0].parts[1].inlineData, { mimeType: 'image/jpeg', data: 'YWJj' });
    assert.equal(contents[1].parts[0].text, 'First answer');
    assert.equal(contents[2].parts[0].text, 'Follow up');
});
