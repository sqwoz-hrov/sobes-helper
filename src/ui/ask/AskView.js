import { html, css, LitElement } from '../../ui/assets/lit-core-2.7.4.min.js';

export class AskView extends LitElement {
    static properties = {
        contexts: { type: Array },
        activeContextId: { type: String },
        currentResponse: { type: String },
        currentQuestion: { type: String },
        isLoading: { type: Boolean },
        isStreaming: { type: Boolean },
        showTextInput: { type: Boolean },
        copyState: { type: String },
        error: { type: String },
    };

    static styles = css`
        :host {
            display: block;
            width: 100%;
            height: 100%;
            color: white;
            transform: translate3d(0, 0, 0);
            font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        * { box-sizing: border-box; }

        button, input { font: inherit; }

        button {
            color: inherit;
            border: 0;
            cursor: pointer;
        }

        .ask-container {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            position: relative;
            background: rgba(0, 0, 0, 0.72);
            border-radius: 12px;
            outline: 0.5px solid rgba(255, 255, 255, 0.3);
            outline-offset: -1px;
            backdrop-filter: blur(12px);
        }

        .response-header {
            min-height: 49px;
            padding: 10px 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            flex: none;
        }

        .response-header.hidden { display: none; }

        .header-left, .header-right, .header-controls {
            display: flex;
            align-items: center;
        }

        .header-left { gap: 8px; flex: none; }
        .header-right { gap: 10px; min-width: 0; justify-content: flex-end; flex: 1; }
        .header-controls { gap: 7px; flex: none; }

        .response-icon {
            width: 20px;
            height: 20px;
            display: grid;
            place-items: center;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.16);
        }

        .response-icon svg { width: 12px; height: 12px; }

        .response-label {
            font-size: 13px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.92);
            white-space: nowrap;
        }

        .question-text {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: rgba(255, 255, 255, 0.6);
            font-size: 12px;
        }

        .icon-button {
            width: 28px;
            height: 28px;
            padding: 0;
            display: grid;
            place-items: center;
            border-radius: 7px;
            background: rgba(255, 255, 255, 0.08);
            transition: background 0.15s ease, color 0.15s ease;
        }

        .icon-button:hover { background: rgba(255, 255, 255, 0.16); }
        .icon-button.copied { color: #7de5a5; }

        .response-body {
            display: flex;
            min-height: 0;
            flex: 1;
        }

        .context-rail {
            width: 112px;
            flex: 0 0 112px;
            padding: 9px 7px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            overflow-y: auto;
            border-right: 1px solid rgba(255, 255, 255, 0.09);
            background: rgba(255, 255, 255, 0.025);
        }

        .context-rail::-webkit-scrollbar,
        .response-container::-webkit-scrollbar { width: 5px; }

        .context-rail::-webkit-scrollbar-thumb,
        .response-container::-webkit-scrollbar-thumb {
            border-radius: 5px;
            background: rgba(255, 255, 255, 0.18);
        }

        .context-tab {
            width: 100%;
            min-height: 45px;
            padding: 7px 8px;
            display: grid;
            grid-template-columns: 7px minmax(0, 1fr);
            align-items: start;
            gap: 6px;
            text-align: left;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.055);
            color: rgba(255, 255, 255, 0.66);
            transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
        }

        .context-tab:hover {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.9);
        }

        .context-tab.active {
            color: white;
            background: rgba(30, 116, 226, 0.54);
            box-shadow: inset 0 0 0 1px rgba(116, 178, 255, 0.42);
        }

        .context-title {
            font-size: 11px;
            line-height: 1.3;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            overflow-wrap: anywhere;
        }

        .status-dot {
            width: 6px;
            height: 6px;
            margin-top: 4px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.35);
        }

        .status-dot.loading, .status-dot.streaming {
            background: #66aaff;
            box-shadow: 0 0 0 0 rgba(102, 170, 255, 0.55);
            animation: pulse 1.35s infinite;
        }

        .status-dot.complete { background: #62d38d; }
        .status-dot.error { background: #ff6b72; }
        .status-dot.interrupted { background: #e5ad5a; }

        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(102, 170, 255, 0.5); }
            70% { box-shadow: 0 0 0 5px rgba(102, 170, 255, 0); }
            100% { box-shadow: 0 0 0 0 rgba(102, 170, 255, 0); }
        }

        .content-column {
            min-width: 0;
            min-height: 0;
            flex: 1;
            display: flex;
            flex-direction: column;
        }

        .response-container {
            min-height: 72px;
            max-height: 585px;
            padding: 14px 16px 18px;
            overflow-y: auto;
            overflow-x: hidden;
            flex: 1;
            scroll-behavior: auto;
        }

        .response-container.hidden { display: none; }

        .thread {
            display: flex;
            flex-direction: column;
            gap: 13px;
        }

        .message {
            max-width: 100%;
            font-size: 13px;
            line-height: 1.55;
        }

        .message.user {
            align-self: flex-end;
            max-width: 86%;
            padding: 8px 10px;
            border-radius: 10px 10px 3px 10px;
            background: rgba(31, 123, 236, 0.72);
            color: rgba(255, 255, 255, 0.96);
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            user-select: text;
        }

        .message.assistant {
            align-self: stretch;
            padding: 2px 2px 10px;
            color: rgba(255, 255, 255, 0.94);
            border-bottom: 1px solid rgba(255, 255, 255, 0.065);
            user-select: text;
        }

        .message.assistant:last-of-type { border-bottom: 0; }
        .message-content, .message-content * { user-select: text; }

        .message-content > :first-child { margin-top: 0; }
        .message-content > :last-child { margin-bottom: 0; }
        .message-content p { margin: 0 0 9px; }
        .message-content ul, .message-content ol { margin: 8px 0; padding-left: 22px; }
        .message-content li { margin: 3px 0; }
        .message-content h1, .message-content h2, .message-content h3,
        .message-content h4, .message-content h5, .message-content h6 {
            margin: 13px 0 7px;
            line-height: 1.3;
        }
        .message-content h1 { font-size: 1.42em; }
        .message-content h2 { font-size: 1.28em; }
        .message-content h3 { font-size: 1.15em; }

        .message-content pre {
            max-width: 100%;
            margin: 9px 0;
            padding: 11px;
            overflow-x: auto;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(0, 0, 0, 0.42);
        }

        .message-content code {
            font-family: Monaco, Menlo, Consolas, monospace;
            font-size: 11px;
        }

        .message-content p code {
            padding: 2px 4px;
            border-radius: 3px;
            color: #ffd76a;
            background: rgba(255, 255, 255, 0.1);
        }

        .message-content table {
            width: max-content;
            min-width: 100%;
            margin: 10px 0;
            border-collapse: collapse;
            font-size: 12px;
        }

        .message-content th, .message-content td {
            padding: 7px 8px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            text-align: left;
            vertical-align: top;
            white-space: normal;
            overflow-wrap: anywhere;
        }

        .message-content blockquote {
            margin: 8px 0;
            padding-left: 10px;
            border-left: 3px solid rgba(98, 165, 255, 0.7);
            color: rgba(255, 255, 255, 0.7);
        }

        .message-content a { color: #82baff; }

        .loading-dots {
            min-height: 28px;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .loading-dot {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.6);
            animation: bounce 1.1s infinite ease-in-out;
        }
        .loading-dot:nth-child(2) { animation-delay: 0.12s; }
        .loading-dot:nth-child(3) { animation-delay: 0.24s; }

        @keyframes bounce {
            0%, 70%, 100% { transform: translateY(0); opacity: 0.45; }
            35% { transform: translateY(-4px); opacity: 1; }
        }

        .error-message, .interrupted-message {
            padding: 8px 10px;
            border-radius: 8px;
            font-size: 12px;
        }
        .error-message { color: #ffb6ba; background: rgba(154, 35, 43, 0.24); }
        .interrupted-message { color: #f1cf94; background: rgba(137, 91, 22, 0.2); }

        .empty-state {
            min-height: 54px;
            display: grid;
            place-items: center;
            color: rgba(255, 255, 255, 0.38);
            font-size: 12px;
        }

        .text-input-container {
            margin: 0 12px 12px;
            padding: 7px;
            display: flex;
            gap: 7px;
            align-items: center;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(255, 255, 255, 0.07);
            flex: none;
        }

        .text-input-container.hidden { display: none; }
        .text-input-container.no-response { margin-top: 12px; }

        .text-input-container input {
            min-width: 0;
            flex: 1;
            padding: 6px 7px;
            color: white;
            border: 0;
            outline: 0;
            background: transparent;
            user-select: text;
        }

        .text-input-container input::placeholder { color: rgba(255, 255, 255, 0.42); }

        .submit-btn {
            height: 28px;
            padding: 0 10px;
            border-radius: 7px;
            background: rgba(41, 126, 232, 0.86);
            font-size: 11px;
            font-weight: 600;
        }

        .submit-btn:hover { background: rgba(57, 143, 246, 0.95); }

        :host-context(body.has-glass) .ask-container,
        :host-context(body.has-glass) .context-rail,
        :host-context(body.has-glass) .text-input-container,
        :host-context(body.has-glass) .icon-button,
        :host-context(body.has-glass) .context-tab {
            background-color: transparent;
            backdrop-filter: none;
        }
    `;

    constructor() {
        super();
        this.contexts = [];
        this.activeContextId = null;
        this.currentResponse = '';
        this.currentQuestion = '';
        this.isLoading = false;
        this.isStreaming = false;
        this.showTextInput = true;
        this.copyState = 'idle';
        this.error = '';
        this.scrollPositions = new Map();
        this.followTail = new Map();
        this.pendingScrollRestore = null;
        this.marked = null;
        this.hljs = null;
        this.DOMPurify = null;
        this.librariesReady = false;
        this.handleEscKey = this.handleEscKey.bind(this);
        this.handleResponseScroll = this.handleResponseScroll.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener('keydown', this.handleEscKey);
        this.loadLibraries();

        this.handleAskStateUpdate = (_event, state) => this.applyState(state);
        this.handleAskContextUpdate = (_event, updatedContext) => this.applyContextUpdate(updatedContext);
        this.handleShowTextInput = () => {
            this.showTextInput = true;
            this.updateComplete.then(() => this.focusTextInput());
        };
        this.handleScrollUp = () => this.scrollBy(-100);
        this.handleScrollDown = () => this.scrollBy(100);

        if (window.api?.askView) {
            window.api.askView.onAskStateUpdate(this.handleAskStateUpdate);
            window.api.askView.onAskContextUpdate(this.handleAskContextUpdate);
            window.api.askView.onShowTextInput(this.handleShowTextInput);
            window.api.askView.onScrollResponseUp(this.handleScrollUp);
            window.api.askView.onScrollResponseDown(this.handleScrollDown);
            window.api.askView.getState().then(state => this.applyState(state));
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('keydown', this.handleEscKey);
        if (window.api?.askView) {
            window.api.askView.removeOnAskStateUpdate(this.handleAskStateUpdate);
            window.api.askView.removeOnAskContextUpdate(this.handleAskContextUpdate);
            window.api.askView.removeOnShowTextInput(this.handleShowTextInput);
            window.api.askView.removeOnScrollResponseUp(this.handleScrollUp);
            window.api.askView.removeOnScrollResponseDown(this.handleScrollDown);
        }
        clearTimeout(this.copyTimeout);
    }

    async loadLibraries() {
        try {
            if (!window.marked) await this.loadScript('../assets/marked-4.3.0.min.js');
            if (!window.hljs) await this.loadScript('../assets/highlight-11.9.0.min.js');
            if (!window.DOMPurify) await this.loadScript('../assets/dompurify-3.0.7.min.js');
            this.marked = window.marked;
            this.hljs = window.hljs;
            this.DOMPurify = window.DOMPurify;
            this.marked?.setOptions({ breaks: true, gfm: true });
            this.librariesReady = Boolean(this.marked && this.DOMPurify);
            this.requestUpdate();
        } catch (error) {
            console.error('Failed to load AskView rendering libraries:', error);
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    applyState(state = {}) {
        const previousId = this.activeContextId;
        if (previousId !== state.activeContextId) this.saveCurrentScroll();
        this.contexts = Array.isArray(state.contexts) ? state.contexts : [];
        this.activeContextId = state.activeContextId || null;
        this.currentResponse = state.currentResponse || '';
        this.currentQuestion = state.currentQuestion || '';
        this.isLoading = Boolean(state.isLoading);
        this.isStreaming = Boolean(state.isStreaming);
        this.showTextInput = Boolean(state.showTextInput);
        this.error = state.error || '';
        if (previousId !== this.activeContextId) this.pendingScrollRestore = this.activeScrollKey;
    }

    applyContextUpdate(updatedContext) {
        if (!updatedContext?.id) return;
        const container = this.responseContainer;
        const wasFollowing = container ? this.isNearBottom(container) : true;
        const existing = this.contexts.findIndex(context => context.id === updatedContext.id);
        const nextContexts = [...this.contexts];
        if (existing >= 0) nextContexts[existing] = updatedContext;
        else nextContexts.unshift(updatedContext);
        this.contexts = nextContexts;
        if (updatedContext.id === this.activeContextId) {
            this.followTail.set(updatedContext.id, wasFollowing);
        }
    }

    get activeContext() {
        return this.contexts.find(context => context.id === this.activeContextId) || null;
    }

    get activeScrollKey() {
        return this.activeContextId || '__legacy__';
    }

    get responseContainer() {
        return this.shadowRoot?.getElementById('responseContainer') || null;
    }

    saveCurrentScroll() {
        const container = this.responseContainer;
        if (!container) return;
        this.scrollPositions.set(this.activeScrollKey, container.scrollTop);
        this.followTail.set(this.activeScrollKey, this.isNearBottom(container));
    }

    isNearBottom(container) {
        return container.scrollHeight - container.scrollTop - container.clientHeight < 40;
    }

    handleResponseScroll() {
        const container = this.responseContainer;
        if (!container) return;
        this.scrollPositions.set(this.activeScrollKey, container.scrollTop);
        this.followTail.set(this.activeScrollKey, this.isNearBottom(container));
    }

    scrollBy(amount) {
        const container = this.responseContainer;
        if (container) container.scrollTop += amount;
    }

    async selectContext(contextId) {
        if (contextId === this.activeContextId) return;
        this.saveCurrentScroll();
        this.activeContextId = contextId;
        this.pendingScrollRestore = contextId;
        await window.api?.askView.selectContext(contextId);
    }

    handleEscKey(event) {
        if (event.key !== 'Escape') return;
        if (!this.activeContext && !this.currentResponse && !this.isLoading && !this.isStreaming) {
            window.api?.askView.closeAskWindow();
        }
    }

    focusTextInput() {
        this.shadowRoot?.getElementById('textInput')?.focus();
    }

    async handleSendText() {
        const input = this.shadowRoot?.getElementById('textInput');
        const text = input?.value?.trim() || '';
        if (!text) return;
        input.value = '';
        await window.api?.askView.sendMessage(text, this.activeContextId);
    }

    handleTextKeydown(event) {
        if (event.isComposing) return;
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.handleSendText();
        }
    }

    async handleCopy() {
        if (this.copyState === 'copied') return;
        const context = this.activeContext;
        const text = context
            ? context.messages.map(message => `${message.role === 'user' ? 'Question' : 'Answer'}: ${message.content}`).join('\n\n')
            : `Question: ${this.currentQuestion}\n\nAnswer: ${this.currentResponse}`;
        if (!text.trim()) return;
        try {
            await navigator.clipboard.writeText(text);
            this.copyState = 'copied';
            clearTimeout(this.copyTimeout);
            this.copyTimeout = setTimeout(() => { this.copyState = 'idle'; }, 1500);
        } catch (error) {
            console.error('Failed to copy Ask response:', error);
        }
    }

    closeWindow() {
        window.api?.askView.closeAskWindow();
    }

    getHeaderText() {
        const status = this.activeContext?.status;
        if (status === 'loading') return 'Thinking…';
        if (status === 'streaming') return 'AI Response · streaming';
        if (status === 'error') return 'AI Response · error';
        if (status === 'interrupted') return 'AI Response · interrupted';
        if (this.isLoading) return 'Thinking…';
        return 'AI Response';
    }

    getLatestQuestion() {
        const context = this.activeContext;
        if (!context) return this.currentQuestion;
        return [...context.messages].reverse().find(message => message.role === 'user')?.content || context.question;
    }

    renderLoadingDots() {
        return html`<div class="loading-dots" aria-label="Loading">
            <span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span>
        </div>`;
    }

    renderThread(context) {
        return html`<div class="thread">
            ${context.messages.map(message => message.role === 'user'
                ? html`<div class="message user">${message.content}</div>`
                : html`<div class="message assistant">
                    ${message.content
                        ? html`<div class="message-content" data-message-id=${message.id}></div>`
                        : this.renderLoadingDots()}
                  </div>`)}
            ${context.status === 'loading' && !context.messages.some(message => message.role === 'assistant' && !message.content)
                ? html`<div class="message assistant">${this.renderLoadingDots()}</div>` : ''}
            ${context.status === 'error' && context.error
                ? html`<div class="error-message">${context.error}</div>` : ''}
            ${context.status === 'interrupted'
                ? html`<div class="interrupted-message">Response interrupted. The partial answer was saved.</div>` : ''}
        </div>`;
    }

    renderLegacy() {
        if (this.isLoading) return this.renderLoadingDots();
        if (this.currentResponse) return html`<div class="message assistant"><div class="message-content legacy-content"></div></div>`;
        if (this.error) return html`<div class="error-message">${this.error}</div>`;
        return html`<div class="empty-state">Ask about your screen or audio</div>`;
    }

    render() {
        const context = this.activeContext;
        const hasResponse = Boolean(context || this.contexts.length || this.isLoading || this.isStreaming || this.currentResponse || this.error);
        const contextBusy = context && ['loading', 'streaming'].includes(context.status);
        const showInput = this.showTextInput && !contextBusy;

        return html`<div class="ask-container">
            <div class="response-header ${hasResponse ? '' : 'hidden'}">
                <div class="header-left">
                    <div class="response-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"></path>
                            <path d="M8 12l2 2 4-4"></path>
                        </svg>
                    </div>
                    <span class="response-label">${this.getHeaderText()}</span>
                </div>
                <div class="header-right">
                    <span class="question-text" title=${this.getLatestQuestion() || ''}>${this.getLatestQuestion()}</span>
                    <div class="header-controls">
                        <button class="icon-button ${this.copyState === 'copied' ? 'copied' : ''}" @click=${this.handleCopy} title="Copy conversation">
                            ${this.copyState === 'copied'
                                ? html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"></path></svg>`
                                : html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>`}
                        </button>
                        <button class="icon-button" @click=${this.closeWindow} title="Close">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                        </button>
                    </div>
                </div>
            </div>

            <div class="response-body">
                ${this.contexts.length ? html`<nav class="context-rail" aria-label="Ask contexts">
                    ${this.contexts.map(item => html`<button
                        class="context-tab ${item.id === this.activeContextId ? 'active' : ''}"
                        @click=${() => this.selectContext(item.id)}
                        title=${item.title}
                    >
                        <span class="status-dot ${item.status}"></span>
                        <span class="context-title">${item.title}</span>
                    </button>`)}
                </nav>` : ''}

                <div class="content-column">
                    <div
                        id="responseContainer"
                        class="response-container ${hasResponse ? '' : 'hidden'}"
                        @scroll=${this.handleResponseScroll}
                    >${context ? this.renderThread(context) : this.renderLegacy()}</div>

                    <div class="text-input-container ${hasResponse ? '' : 'no-response'} ${showInput ? '' : 'hidden'}">
                        <input
                            id="textInput"
                            type="text"
                            placeholder=${context ? 'Ask a follow-up in this context' : 'Ask about your screen or audio'}
                            @keydown=${this.handleTextKeydown}
                        />
                        <button class="submit-btn" @click=${this.handleSendText}>Submit ↵</button>
                    </div>
                </div>
            </div>
        </div>`;
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        this.renderMarkdownContent();
        const container = this.responseContainer;
        if (container) {
            if (this.pendingScrollRestore) {
                const key = this.pendingScrollRestore;
                this.pendingScrollRestore = null;
                const saved = this.scrollPositions.get(key);
                container.scrollTop = saved == null ? container.scrollHeight : saved;
            } else if (this.followTail.get(this.activeScrollKey) !== false) {
                container.scrollTop = container.scrollHeight;
            }
        }
        if (changedProperties.has('showTextInput') && this.showTextInput) this.focusTextInput();
        this.adjustWindowHeightThrottled();
    }

    renderMarkdownContent() {
        if (!this.shadowRoot) return;
        const context = this.activeContext;
        this.shadowRoot.querySelectorAll('[data-message-id]').forEach(element => {
            const message = context?.messages.find(item => item.id === element.dataset.messageId);
            if (message) this.renderMarkdownInto(element, message.content);
        });
        const legacy = this.shadowRoot.querySelector('.legacy-content');
        if (legacy) this.renderMarkdownInto(legacy, this.currentResponse);
    }

    renderMarkdownInto(element, text) {
        if (!this.librariesReady) {
            element.textContent = text || '';
            return;
        }
        try {
            const fenceCount = (text.match(/```/g) || []).length;
            const completedText = fenceCount % 2 ? `${text}\n\`\`\`` : text;
            element.innerHTML = this.DOMPurify.sanitize(this.marked.parse(completedText), {
                ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'b', 'em', 'i',
                    'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'table', 'thead', 'tbody', 'tr', 'th',
                    'td', 'hr', 'sup', 'sub', 'del', 'ins'],
                ALLOWED_ATTR: ['href', 'title', 'class', 'target', 'rel'],
            });
            this.hljs && element.querySelectorAll('pre code').forEach(block => this.hljs.highlightElement(block));
        } catch (error) {
            element.textContent = text || '';
        }
    }

    adjustWindowHeightThrottled() {
        if (this.resizePending) return;
        this.resizePending = true;
        requestAnimationFrame(() => {
            this.resizePending = false;
            const header = this.shadowRoot?.querySelector('.response-header');
            const body = this.shadowRoot?.querySelector('.response-body');
            if (!body) return;
            const targetHeight = Math.min(700, Math.max(70, (header?.offsetHeight || 0) + body.scrollHeight));
            window.api?.askView.adjustWindowHeight('ask', targetHeight);
        });
    }
}

customElements.define('ask-view', AskView);
