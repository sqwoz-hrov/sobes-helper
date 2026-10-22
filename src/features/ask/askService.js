const crypto = require('node:crypto');
const { createStreamingLLM } = require('../common/ai/factory');
const internalBridge = require('../../bridge/internalBridge');
const sessionRepository = require('../common/repositories/session');
const askRepository = require('./repositories');
const contextRepository = require('./repositories/context.sqlite.repository');
const authService = require('../common/services/authService');
const { getSystemPrompt } = require('../common/prompts/promptBuilder');
const { screenshotSelectionPrompt, recentThemPrompt } = require('../common/prompts/promptTemplates');
const modelStateService = require('../common/services/modelStateService');
const { captureScreenshot } = require('./screenshotCapture');
const { ContextScreenshotCache } = require('./contextScreenshotCache');
const {
    deriveContextTitle,
    makePlaceholderTitle,
    serializeContext,
} = require('./contextUtils');

const getWindowManager = () => require('../../window/windowManager');
const getWindowPool = () => {
    try {
        return getWindowManager().windowPool;
    } catch {
        return null;
    }
};

class AskService {
    constructor() {
        this.abortController = null;
        this.contextControllers = new Map();
        this.contextTasks = new Map();
        this.contexts = new Map();
        this.activeContextId = null;
        this.currentSessionId = null;
        this.screenshotCache = new ContextScreenshotCache();
        this.state = this._emptyLegacyState();
        console.log('[AskService] Service instance created.');
    }

    _emptyLegacyState() {
        return {
            isVisible: false,
            isLoading: false,
            isStreaming: false,
            currentQuestion: '',
            currentResponse: '',
            error: '',
            showTextInput: true,
        };
    }

    async initialize() {
        try {
            await this.screenshotCache.cleanupAll();
            console.log('[AskService] Removed stale context screenshot cache.');
        } catch (error) {
            console.warn('[AskService] Failed to remove stale screenshot cache:', error.message);
        }
    }

    getState() {
        return {
            ...this.state,
            activeContextId: this.activeContextId,
            contexts: this._orderedContexts().map(serializeContext),
        };
    }

    _orderedContexts() {
        return Array.from(this.contexts.values()).sort((left, right) => {
            if (right.createdAt !== left.createdAt) return right.createdAt - left.createdAt;
            return right.id.localeCompare(left.id);
        });
    }

    _sendToAskWindow(channel, payload) {
        const askWindow = getWindowPool()?.get('ask');
        if (askWindow && !askWindow.isDestroyed()) {
            askWindow.webContents.send(channel, payload);
        }
    }

    _broadcastState() {
        this._sendToAskWindow('ask:stateUpdate', this.getState());
    }

    _broadcastContext(context) {
        if (!this.contexts.has(context.id)) return;
        this._sendToAskWindow('ask:contextUpdate', serializeContext(context));
    }

    _showAskWindow() {
        internalBridge.emit('window:requestVisibility', { name: 'ask', visible: true });
        this.state.isVisible = true;
    }

    async toggleAskButton(inputScreenOnly = false) {
        const askWindow = getWindowPool()?.get('ask');

        if (inputScreenOnly && this.state.showTextInput && askWindow?.isVisible()) {
            await this._sendLegacyMessage('', []);
            return;
        }

        const hasContent = this.contexts.size > 0
            || this.state.isLoading
            || this.state.isStreaming
            || Boolean(this.state.currentResponse);

        if (askWindow?.isVisible() && hasContent) {
            this.state.showTextInput = !this.state.showTextInput;
            this._broadcastState();
            return;
        }

        const visible = !askWindow?.isVisible();
        internalBridge.emit('window:requestVisibility', { name: 'ask', visible });
        this.state.isVisible = visible;
        if (visible) this.state.showTextInput = true;
        this._broadcastState();
    }

    async closeAskWindow() {
        if (this.abortController) {
            this.abortController.abort('Window closed by user');
            this.abortController = null;
        }
        for (const controller of this.contextControllers.values()) {
            controller.abort('Window closed by user');
        }
        await Promise.allSettled(Array.from(this.contextTasks.values()));

        this.state = { ...this._emptyLegacyState(), isVisible: false };
        this._broadcastState();
        internalBridge.emit('window:requestVisibility', { name: 'ask', visible: false });
        return { success: true };
    }

    _formatConversationForPrompt(conversationTexts) {
        if (!conversationTexts || conversationTexts.length === 0) {
            return 'No conversation history available.';
        }
        return conversationTexts.slice(-30).join('\n');
    }

    async sendSelectedScreenshot(screenshotBase64) {
        if (!screenshotBase64) {
            return { success: false, error: 'The selected screenshot is empty.' };
        }
        return this._createContextAndSend({
            sourceType: 'screenshot',
            question: screenshotSelectionPrompt,
            sourcePayload: { hasScreenshot: true },
            screenshotBase64,
        });
    }

    async sendRecentThemChunks() {
        const listenService = require('../listen/listenService');
        const conversationHistory = listenService.getConversationHistory();
        const recentThemChunks = conversationHistory
            .filter(turn => typeof turn === 'string' && /^them:\s*/i.test(turn))
            .slice(-3);

        if (recentThemChunks.length === 0) {
            return { success: false, error: 'No transcript chunks from Them are available yet.' };
        }

        return this._createContextAndSend({
            sourceType: 'quick_ask',
            question: recentThemPrompt,
            sourcePayload: { conversationTexts: recentThemChunks },
        });
    }

    async _createContextAndSend({ sourceType, question, sourcePayload, screenshotBase64 = null }) {
        this._showAskWindow();
        const sessionId = await sessionRepository.getOrCreateActive('ask');
        await this._activateSession(sessionId);

        const id = crypto.randomUUID();
        const ordinal = this._orderedContexts().filter(context => context.sourceType === sourceType).length + 1;
        const title = makePlaceholderTitle(sourceType, ordinal);
        const now = Date.now();
        const context = {
            id,
            sessionId,
            uid: authService.getCurrentUserId(),
            sourceType,
            question,
            sourcePayload: sourcePayload || {},
            title,
            status: 'loading',
            error: '',
            createdAt: now,
            updatedAt: now,
            messages: [],
        };

        contextRepository.createContext({
            id,
            sessionId,
            uid: context.uid,
            sourceType,
            question,
            sourcePayload: context.sourcePayload,
            title,
            status: context.status,
        });

        if (screenshotBase64) {
            try {
                await this.screenshotCache.save(sessionId, id, screenshotBase64);
            } catch (error) {
                context.status = 'error';
                context.error = error.message;
                contextRepository.updateContext(id, { status: context.status });
                this.contexts.set(id, context);
                this.activeContextId = id;
                this._broadcastState();
                return { success: false, contextId: id, error: error.message };
            }
        }

        this.contexts.set(id, context);
        this.activeContextId = id;
        this.state.showTextInput = false;
        const userMessage = this._saveContextMessage(context, 'user', question);
        context.messages.push(userMessage);
        this._broadcastState();

        const result = await this._startContextTurn(context);
        return { ...result, contextId: id };
    }

    async _activateSession(sessionId) {
        if (!this.currentSessionId || this.currentSessionId === sessionId) {
            this.currentSessionId = sessionId;
            return;
        }
        await this.endSession(this.currentSessionId);
        this.currentSessionId = sessionId;
    }

    _saveContextMessage(context, role, content, model = 'unknown', id = crypto.randomUUID()) {
        const sequence = context.messages.length;
        return contextRepository.addMessage({
            id,
            contextId: context.id,
            sequence,
            role,
            content,
            model,
        });
    }

    async sendMessage(userPrompt, conversationHistoryRaw = [], options = {}) {
        if (options.contextId) {
            return this.sendContextMessage(options.contextId, userPrompt);
        }
        return this._sendLegacyMessage(userPrompt, conversationHistoryRaw, options);
    }

    async sendContextMessage(contextId, userPrompt) {
        const context = this.contexts.get(contextId);
        const prompt = String(userPrompt || '').trim();
        if (!context) return { success: false, error: 'The selected context is no longer available.' };
        if (!prompt) return { success: false, error: 'Enter a follow-up question.' };
        if (this.contextControllers.has(contextId)) {
            return { success: false, error: 'This context is already generating a response.' };
        }

        if (context.sourceType === 'screenshot') {
            try {
                await this.screenshotCache.readDataUrl(context.sessionId, context.id);
            } catch {
                context.status = 'error';
                context.error = 'The original screenshot is no longer available for this context.';
                contextRepository.updateContext(context.id, { status: context.status });
                this._broadcastContext(context);
                return { success: false, error: context.error };
            }
        }

        this.activeContextId = contextId;
        context.error = '';
        context.status = 'loading';
        context.updatedAt = Date.now();
        const userMessage = this._saveContextMessage(context, 'user', prompt);
        context.messages.push(userMessage);
        contextRepository.updateContext(context.id, { status: context.status });
        this.state.showTextInput = false;
        this._broadcastState();
        return this._startContextTurn(context);
    }

    _startContextTurn(context) {
        const task = this._runContextTurn(context);
        this.contextTasks.set(context.id, task);
        const cleanup = () => {
            if (this.contextTasks.get(context.id) === task) this.contextTasks.delete(context.id);
        };
        task.then(cleanup, cleanup);
        return task;
    }

    async _buildContextProviderMessages(context) {
        const conversationTexts = context.sourcePayload.conversationTexts || [];
        const systemPrompt = getSystemPrompt(
            'pickle_glass_analysis',
            this._formatConversationForPrompt(conversationTexts),
            false
        );
        let screenshotDataUrl = null;
        if (context.sourceType === 'screenshot') {
            screenshotDataUrl = await this.screenshotCache.readDataUrl(context.sessionId, context.id);
        }

        const messages = [{ role: 'system', content: systemPrompt }];
        for (const message of context.messages) {
            if (message.transient) continue;
            const text = message.role === 'user' ? `User Request: ${message.content}` : message.content;
            if (message.role === 'user' && message.sequence === 0 && screenshotDataUrl) {
                messages.push({
                    role: 'user',
                    content: [
                        { type: 'text', text },
                        { type: 'image_url', image_url: { url: screenshotDataUrl } },
                    ],
                });
            } else {
                messages.push({ role: message.role, content: text });
            }
        }
        return messages;
    }

    async _runContextTurn(context) {
        const controller = new AbortController();
        this.contextControllers.set(context.id, controller);
        const { signal } = controller;
        const assistantId = crypto.randomUUID();
        const assistantMessage = {
            id: assistantId,
            sequence: context.messages.length,
            role: 'assistant',
            content: '',
            model: 'unknown',
            sentAt: Math.floor(Date.now() / 1000),
            transient: true,
        };
        context.messages.push(assistantMessage);
        let fullResponse = '';

        try {
            const modelInfo = await modelStateService.getCurrentModelInfo('llm');
            if (!modelInfo?.apiKey) throw new Error('AI model or API key not configured.');
            assistantMessage.model = modelInfo.model;
            const messages = await this._buildContextProviderMessages(context);
            context.status = 'streaming';
            contextRepository.updateContext(context.id, { status: context.status });
            this._broadcastContext(context);

            fullResponse = await this._streamCompletion(messages, modelInfo, signal, token => {
                assistantMessage.content += token;
                fullResponse = assistantMessage.content;
                context.updatedAt = Date.now();
                this._broadcastContext(context);
            });

            context.status = signal.aborted ? 'interrupted' : 'complete';
            return { success: !signal.aborted, response: fullResponse, error: signal.aborted ? String(signal.reason || 'Interrupted') : undefined };
        } catch (error) {
            if (signal.aborted) {
                context.status = 'interrupted';
                context.error = '';
            } else {
                context.status = 'error';
                context.error = error.message || 'Unknown error occurred';
            }
            return { success: false, response: fullResponse, error: context.error || String(signal.reason || 'Interrupted') };
        } finally {
            this.contextControllers.delete(context.id);
            const assistantIndex = context.messages.findIndex(message => message.id === assistantId);
            if (fullResponse) {
                const persisted = contextRepository.addMessage({
                    id: assistantId,
                    contextId: context.id,
                    sequence: assistantMessage.sequence,
                    role: 'assistant',
                    content: fullResponse,
                    model: assistantMessage.model,
                });
                context.messages[assistantIndex] = persisted;
                if (context.messages.filter(message => message.role === 'assistant').length === 1) {
                    context.title = deriveContextTitle(fullResponse, context.title);
                }
            } else if (assistantIndex >= 0) {
                context.messages.splice(assistantIndex, 1);
            }
            context.updatedAt = Date.now();
            contextRepository.updateContext(context.id, {
                title: context.title,
                status: context.status,
            });
            this._broadcastContext(context);
        }
    }

    _createStreamingClient(modelInfo) {
        return createStreamingLLM(modelInfo.provider, {
            apiKey: modelInfo.apiKey,
            model: modelInfo.model,
            temperature: 0.7,
            maxTokens: 2048,
        });
    }

    async _streamCompletion(messages, modelInfo, signal, onToken) {
        const client = this._createStreamingClient(modelInfo);
        try {
            const response = await client.streamChat(messages);
            return await this._consumeStream(response.body.getReader(), signal, onToken);
        } catch (error) {
            const hasImage = messages.some(message => Array.isArray(message.content)
                && message.content.some(part => part?.type === 'image_url'));
            if (!hasImage || !this._isMultimodalError(error) || signal.aborted) throw error;
            const textOnlyMessages = messages.map(message => ({
                ...message,
                content: Array.isArray(message.content)
                    ? message.content.filter(part => part?.type === 'text').map(part => part.text).join('\n')
                    : message.content,
            }));
            const fallbackResponse = await client.streamChat(textOnlyMessages);
            return this._consumeStream(fallbackResponse.body.getReader(), signal, onToken);
        }
    }

    async _consumeStream(reader, signal, onToken) {
        const decoder = new TextDecoder();
        let buffer = '';
        let response = '';
        const abortReader = () => reader.cancel(signal.reason).catch(() => {});
        signal.addEventListener('abort', abortReader, { once: true });
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const rawLine of lines) {
                    const line = rawLine.trim();
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') return response;
                    try {
                        const token = JSON.parse(data).choices?.[0]?.delta?.content || '';
                        if (token) {
                            response += token;
                            onToken(token);
                        }
                    } catch {
                        // Ignore provider keepalives and incomplete event payloads.
                    }
                }
            }
            return response;
        } finally {
            signal.removeEventListener('abort', abortReader);
        }
    }

    async _sendLegacyMessage(userPrompt, conversationHistoryRaw = [], options = {}) {
        this._showAskWindow();
        this.activeContextId = null;
        this.state = {
            ...this.state,
            isLoading: true,
            isStreaming: false,
            currentQuestion: userPrompt,
            currentResponse: '',
            error: '',
            showTextInput: false,
        };
        this._broadcastState();

        if (this.abortController) this.abortController.abort('New legacy request received.');
        this.abortController = new AbortController();
        const { signal } = this.abortController;
        let sessionId;
        let fullResponse = '';

        try {
            sessionId = await sessionRepository.getOrCreateActive('ask');
            await this._activateSession(sessionId);
            this.state.showTextInput = false;
            await askRepository.addAiMessage({ sessionId, role: 'user', content: userPrompt.trim() });
            const modelInfo = await modelStateService.getCurrentModelInfo('llm');
            if (!modelInfo?.apiKey) throw new Error('AI model or API key not configured.');

            const screenshotResult = options.screenshotBase64
                ? { success: true, base64: options.screenshotBase64 }
                : await captureScreenshot({ quality: 'medium' });
            const screenshotBase64 = screenshotResult.success ? screenshotResult.base64 : null;
            const systemPrompt = getSystemPrompt(
                'pickle_glass_analysis',
                this._formatConversationForPrompt(conversationHistoryRaw),
                false
            );
            const userContent = [{ type: 'text', text: `User Request: ${userPrompt.trim()}` }];
            if (screenshotBase64) {
                userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` } });
            }
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ];
            this.state.isLoading = false;
            this.state.isStreaming = true;
            this._broadcastState();
            fullResponse = await this._streamCompletion(messages, modelInfo, signal, token => {
                this.state.currentResponse += token;
                this._broadcastState();
            });
            return { success: !signal.aborted, response: fullResponse };
        } catch (error) {
            if (!signal.aborted) {
                this.state.error = error.message || 'Unknown error occurred';
                this._sendToAskWindow('ask-response-stream-error', { error: this.state.error });
            }
            return { success: false, error: this.state.error || String(signal.reason || 'Interrupted') };
        } finally {
            this.state.isLoading = false;
            this.state.isStreaming = false;
            this.state.currentResponse = fullResponse || this.state.currentResponse;
            this._broadcastState();
            if (sessionId && this.state.currentResponse) {
                try {
                    await askRepository.addAiMessage({ sessionId, role: 'assistant', content: this.state.currentResponse });
                } catch (error) {
                    console.error('[AskService] Failed to save legacy assistant response:', error);
                }
            }
        }
    }

    selectContext(contextId) {
        if (!this.contexts.has(contextId)) {
            return { success: false, error: 'Context not found.' };
        }
        this.activeContextId = contextId;
        this.state.showTextInput = false;
        this._broadcastState();
        return { success: true };
    }

    navigateContext(direction) {
        const contexts = this._orderedContexts();
        if (contexts.length === 0) return { success: false, error: 'No contexts available.' };
        let index = contexts.findIndex(context => context.id === this.activeContextId);
        if (index < 0) index = 0;
        const nextIndex = Math.max(0, Math.min(contexts.length - 1, index + direction));
        return this.selectContext(contexts[nextIndex].id);
    }

    async endSession(sessionId = this.currentSessionId) {
        if (!sessionId) return { success: true };
        const pendingTasks = [];
        for (const [contextId, controller] of this.contextControllers) {
            const context = this.contexts.get(contextId);
            if (context?.sessionId === sessionId) {
                controller.abort('Session ended');
                const task = this.contextTasks.get(contextId);
                if (task) pendingTasks.push(task);
            }
        }
        await Promise.allSettled(pendingTasks);
        await this.screenshotCache.cleanupSession(sessionId).catch(error => {
            console.warn('[AskService] Failed to clean screenshot session cache:', error.message);
        });
        for (const [id, context] of this.contexts) {
            if (context.sessionId === sessionId) this.contexts.delete(id);
        }
        if (!this.contexts.has(this.activeContextId)) this.activeContextId = null;
        if (this.currentSessionId === sessionId) this.currentSessionId = null;
        if (this.contexts.size === 0) this.state.showTextInput = true;
        this._broadcastState();
        return { success: true };
    }

    async endAllContextSessions() {
        const sessionIds = new Set(Array.from(this.contexts.values()).map(context => context.sessionId));
        if (this.currentSessionId) sessionIds.add(this.currentSessionId);
        for (const sessionId of sessionIds) {
            await this.endSession(sessionId);
        }
        return { success: true };
    }

    _isMultimodalError(error) {
        const message = error?.message?.toLowerCase() || '';
        return ['vision', 'image', 'multimodal', 'unsupported', 'image_url', '400', 'invalid', 'not supported']
            .some(fragment => message.includes(fragment));
    }
}

module.exports = new AskService();
