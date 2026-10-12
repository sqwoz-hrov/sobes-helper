const TITLE_MAX_LENGTH = 30;

function stripMarkdown(value) {
    return String(value || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s*/gm, '')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_~`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function truncateUnicode(value, maxLength = TITLE_MAX_LENGTH) {
    const characters = Array.from(value || '');
    if (characters.length <= maxLength) return characters.join('');
    return `${characters.slice(0, Math.max(1, maxLength - 1)).join('')}…`;
}

function deriveContextTitle(response, fallback, maxLength = TITLE_MAX_LENGTH) {
    const lines = String(response || '')
        .split(/\r?\n/)
        .map(stripMarkdown)
        .filter(Boolean);
    return truncateUnicode(lines[0] || fallback, maxLength);
}

function makePlaceholderTitle(sourceType, ordinal) {
    const label = sourceType === 'screenshot' ? 'Screenshot' : 'Quick Ask';
    return `${label} ${ordinal}`;
}

function serializeContext(context) {
    return {
        id: context.id,
        sessionId: context.sessionId,
        sourceType: context.sourceType,
        question: context.question,
        title: context.title,
        status: context.status,
        error: context.error || '',
        createdAt: context.createdAt,
        updatedAt: context.updatedAt,
        messages: context.messages.map(message => ({
            id: message.id,
            sequence: message.sequence,
            role: message.role,
            content: message.content,
            model: message.model || 'unknown',
            sentAt: message.sentAt,
        })),
    };
}

module.exports = {
    TITLE_MAX_LENGTH,
    deriveContextTitle,
    makePlaceholderTitle,
    serializeContext,
    stripMarkdown,
    truncateUnicode,
};
