import test from 'node:test';
import assert from 'node:assert/strict';

function createMemoryStorage() {
    const store = new Map();
    return {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, val) => store.set(String(key), String(val)),
        removeItem: key => store.delete(String(key)),
        clear: () => store.clear()
    };
}

function createDomEnvironment() {
    const elementsById = new Map();
    const docListeners = new Map();

    class MiniClassList {
        constructor(el) {
            this.el = el;
            this.set = new Set();
        }
        _sync() {
            const str = [...this.set].join(' ');
            this.el._attrs.set('class', str);
        }
        _load(clsStr) {
            this.set = new Set(String(clsStr || '').split(/\s+/).filter(Boolean));
        }
        add(...tokens) {
            tokens.forEach(t => t && this.set.add(t));
            this._sync();
        }
        remove(...tokens) {
            tokens.forEach(t => this.set.delete(t));
            this._sync();
        }
        toggle(token, force) {
            if (force === true) this.set.add(token);
            else if (force === false) this.set.delete(token);
            else if (this.set.has(token)) this.set.delete(token);
            else this.set.add(token);
            this._sync();
            return this.set.has(token);
        }
        contains(token) {
            return this.set.has(token);
        }
    }

    function camelToKebab(str) {
        return str.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
    }

    function kebabToCamel(str) {
        return str.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    }

    class MiniElement {
        constructor(tagName, ownerDocument) {
            this.tagName = String(tagName || 'div').toUpperCase();
            this.ownerDocument = ownerDocument;
            this.children = [];
            this.parentNode = null;
            this._attrs = new Map();
            this.classList = new MiniClassList(this);
            this.style = {};
            this.listeners = new Map();
            this._text = '';
            this.inert = false;
            this.disabled = false;
            this.checked = false;
            this.hidden = false;
            this.value = '';
            this.name = '';
            this.type = '';
            this.title = '';

            this.dataset = new Proxy({}, {
                get: (_, prop) => this._attrs.get(`data-${camelToKebab(String(prop))}`),
                set: (_, prop, val) => {
                    this._attrs.set(`data-${camelToKebab(String(prop))}`, String(val));
                    return true;
                },
                deleteProperty: (_, prop) => {
                    this._attrs.delete(`data-${camelToKebab(String(prop))}`);
                    return true;
                }
            });
        }

        get id() {
            return this._attrs.get('id') || '';
        }
        set id(val) {
            const old = this._attrs.get('id');
            if (old && elementsById.get(old) === this) elementsById.delete(old);
            if (val) {
                this._attrs.set('id', String(val));
                elementsById.set(String(val), this);
            } else {
                this._attrs.delete('id');
            }
        }

        get className() {
            return this._attrs.get('class') || '';
        }
        set className(val) {
            this.classList._load(val);
            this._attrs.set('class', String(val || ''));
        }

        get textContent() {
            if (this.children.length === 0) return this._text;
            return this._text + this.children.map(c => c.textContent).join('');
        }
        set textContent(val) {
            this.children = [];
            this._text = String(val ?? '');
        }

        get innerHTML() {
            return this.textContent;
        }
        set innerHTML(html) {
            this.children = [];
            this._text = '';
            parseHtmlInto(String(html ?? ''), this, this.ownerDocument);
        }

        setAttribute(name, value) {
            const key = String(name);
            const strVal = String(value);
            this._attrs.set(key, strVal);
            if (key === 'id') this.id = strVal;
            else if (key === 'class') this.classList._load(strVal);
            else if (key === 'disabled') this.disabled = true;
            else if (key === 'hidden') this.hidden = true;
            else if (key === 'checked') this.checked = true;
            else if (key === 'value') this.value = strVal;
            else if (key === 'name') this.name = strVal;
            else if (key === 'type') this.type = strVal;
            else if (key === 'title') this.title = strVal;
        }

        getAttribute(name) {
            const key = String(name);
            if (key === 'class') return this.className || null;
            return this._attrs.has(key) ? this._attrs.get(key) : null;
        }

        hasAttribute(name) {
            const key = String(name);
            if (key === 'disabled') return Boolean(this.disabled) || this._attrs.has(key);
            if (key === 'hidden') return Boolean(this.hidden) || this._attrs.has(key);
            return this._attrs.has(key);
        }

        removeAttribute(name) {
            const key = String(name);
            this._attrs.delete(key);
            if (key === 'disabled') this.disabled = false;
            if (key === 'hidden') this.hidden = false;
        }

        appendChild(node) {
            if (!node) return node;
            if (node.tagName === '#FRAGMENT') {
                [...node.children].forEach(c => this.appendChild(c));
                node.children = [];
                return node;
            }
            if (node.parentNode) node.parentNode.removeChild(node);
            node.parentNode = this;
            this.children.push(node);
            if (node.id) elementsById.set(node.id, node);
            return node;
        }

        append(...nodes) {
            nodes.forEach(n => {
                if (typeof n === 'string') {
                    this._text += n;
                } else if (n) {
                    this.appendChild(n);
                }
            });
        }

        prepend(...nodes) {
            for (let i = nodes.length - 1; i >= 0; i--) {
                const n = nodes[i];
                if (!n) continue;
                if (n.parentNode) n.parentNode.removeChild(n);
                n.parentNode = this;
                this.children.unshift(n);
                if (n.id) elementsById.set(n.id, n);
            }
        }

        insertBefore(newNode, refNode) {
            const idx = this.children.indexOf(refNode);
            if (idx === -1) return this.appendChild(newNode);
            if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
            newNode.parentNode = this;
            this.children.splice(idx, 0, newNode);
            return newNode;
        }

        removeChild(node) {
            const idx = this.children.indexOf(node);
            if (idx >= 0) {
                this.children.splice(idx, 1);
                node.parentNode = null;
            }
            return node;
        }

        remove() {
            if (this.parentNode) {
                this.parentNode.removeChild(this);
            }
        }

        contains(target) {
            if (!target) return false;
            if (target === this) return true;
            return this.children.some(c => c.contains(target));
        }

        focus() {
            this.ownerDocument.activeElement = this;
        }

        addEventListener(type, fn) {
            if (!this.listeners.has(type)) this.listeners.set(type, []);
            this.listeners.get(type).push(fn);
        }

        dispatchEvent(event) {
            const evt = event || { type: 'click', target: this };
            evt.target = evt.target || this;
            for (const fn of (this.listeners.get(evt.type) || [])) {
                fn.call(this, evt);
            }
            if (evt.bubbles && this.parentNode) {
                this.parentNode.dispatchEvent(evt);
            }
        }

        matches(selector) {
            return String(selector)
                .split(',')
                .map(s => s.trim())
                .some(part => matchesCompound(this, part));
        }

        closest(selector) {
            let cur = this;
            while (cur && cur.tagName) {
                if (cur.matches(selector)) return cur;
                cur = cur.parentNode;
            }
            return null;
        }

        querySelectorAll(selector) {
            const results = [];
            const visit = node => {
                for (const child of node.children) {
                    if (matchesSelectorList(child, selector)) results.push(child);
                    visit(child);
                }
            };
            visit(this);
            return results;
        }

        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        }
    }

    function matchesCompound(el, compound) {
        if (!compound || !el || !el.tagName || el.tagName === '#FRAGMENT') return false;
        let rest = compound;
        const tagMatch = rest.match(/^([a-zA-Z0-9_-]+)/);
        if (tagMatch) {
            if (el.tagName !== tagMatch[1].toUpperCase()) return false;
            rest = rest.slice(tagMatch[0].length);
        }

        while (rest.length > 0) {
            if (rest.startsWith('#')) {
                const m = rest.match(/^#([a-zA-Z0-9_-]+)/);
                if (!m || el.id !== m[1]) return false;
                rest = rest.slice(m[0].length);
            } else if (rest.startsWith('.')) {
                const m = rest.match(/^\.([a-zA-Z0-9_-]+)/);
                if (!m || !el.classList.contains(m[1])) return false;
                rest = rest.slice(m[0].length);
            } else if (rest.startsWith('[')) {
                const m = rest.match(/^\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/);
                if (!m) return false;
                const attrName = m[1];
                const expected = m[2];
                if (expected !== undefined) {
                    const actual = attrName === 'name'
                        ? el.name
                        : (attrName === 'type' ? el.type : el.getAttribute(attrName));
                    if (actual !== expected) return false;
                } else if (!el.hasAttribute(attrName)) {
                    return false;
                }
                rest = rest.slice(m[0].length);
            } else if (rest.startsWith(':not(')) {
                const closeIdx = rest.indexOf(')');
                const inner = rest.slice(5, closeIdx);
                if (matchesCompound(el, inner)) return false;
                rest = rest.slice(closeIdx + 1);
            } else if (rest.startsWith(':checked')) {
                if (!el.checked) return false;
                rest = rest.slice(':checked'.length);
            } else {
                return false;
            }
        }
        return true;
    }

    function matchesDescendant(el, chain) {
        const parts = chain.trim().split(/\s+/);
        if (!matchesCompound(el, parts[parts.length - 1])) return false;
        let cur = el.parentNode;
        for (let i = parts.length - 2; i >= 0; i--) {
            while (cur && !matchesCompound(cur, parts[i])) {
                cur = cur.parentNode;
            }
            if (!cur) return false;
            cur = cur.parentNode;
        }
        return true;
    }

    function matchesSelectorList(el, selector) {
        return String(selector)
            .split(',')
            .map(s => s.trim())
            .some(part => matchesDescendant(el, part));
    }

    const VOID_TAGS = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);

    function parseHtmlInto(html, parent, doc) {
        const tokenRe = /<(\/?)([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
        const stack = [parent];
        let match;
        while ((match = tokenRe.exec(html)) !== null) {
            if (match[4] !== undefined) {
                const text = match[4];
                if (text) stack[stack.length - 1]._text += text;
                continue;
            }
            const isClose = match[1] === '/';
            const tag = match[2].toLowerCase();
            const attrStr = match[3] || '';
            if (isClose) {
                if (stack.length > 1) stack.pop();
                continue;
            }
            const el = new MiniElement(tag, doc);
            const attrRe = /([a-zA-Z0-9_-]+)(?:="([^"]*)"|='([^']*)')?/g;
            let attrMatch;
            while ((attrMatch = attrRe.exec(attrStr)) !== null) {
                const aName = attrMatch[1];
                const aVal = attrMatch[2] ?? attrMatch[3] ?? '';
                if (aName === 'data-qid') el.dataset.qid = aVal;
                if (aName.startsWith('data-')) {
                    el.dataset[kebabToCamel(aName.slice(5))] = aVal;
                }
                el.setAttribute(aName, aVal);
            }
            stack[stack.length - 1].appendChild(el);
            if (!VOID_TAGS.has(tag) && !attrStr.trim().endsWith('/')) {
                stack.push(el);
            }
        }
    }

    const doc = {
        activeElement: null,
        createElement: tag => new MiniElement(tag, doc),
        createDocumentFragment: () => new MiniElement('#FRAGMENT', doc),
        getElementById: id => elementsById.get(id) || null,
        querySelectorAll: sel => doc.documentElement.querySelectorAll(sel),
        querySelector: sel => doc.documentElement.querySelector(sel),
        contains: node => doc.documentElement.contains(node),
        addEventListener: (type, fn) => {
            if (!docListeners.has(type)) docListeners.set(type, []);
            docListeners.get(type).push(fn);
        },
        removeEventListener: (type, fn) => {
            const list = docListeners.get(type);
            if (!list) return;
            const idx = list.indexOf(fn);
            if (idx >= 0) list.splice(idx, 1);
        }
    };

    doc.documentElement = new MiniElement('html', doc);
    doc.body = new MiniElement('body', doc);
    doc.documentElement.appendChild(doc.body);

    doc.body.innerHTML = `
        <div id="sidebar"></div>
        <div id="main-content">
            <span class="workspace-path"></span>
            <h1 id="main-title">机械设计基础</h1>
            <div id="global-controls">
                <button id="test-all-wrong-btn" type="button"></button>
                <button id="test-chapter-wrong-btn" type="button"></button>
                <button id="toggle-pending-wrong-btn" type="button"></button>
                <button id="toggle-favorites-btn" type="button"></button>
                <button id="toggle-all-answers-btn" type="button"></button>
                <button id="toggle-practice-track-btn" type="button"></button>
                <button id="clear-chapter-wrong-answers-btn" type="button"></button>
                <button id="clear-all-wrong-answers-btn" type="button"></button>
            </div>
            <div id="content-area"></div>
            <div id="welcome-message"></div>
        </div>
        <div id="right-sidebar"></div>
        <div id="quiz-modal" aria-hidden="true">
            <div id="quiz-container">
                <button id="close-quiz" type="button"></button>
                <div id="quiz-timer"></div>
                <h2 id="quiz-title"></h2>
                <div id="quiz-content">
                    <div class="quiz-toolbar">
                        <div id="quiz-progress"></div>
                        <button id="quiz-flag-btn" type="button"></button>
                        <button id="quiz-favorite-btn" type="button"></button>
                    </div>
                    <div id="quiz-sheet-nav"></div>
                    <div id="quiz-question-container">
                        <p id="keyboard-instructions"></p>
                        <p id="quiz-question-text"></p>
                        <div id="quiz-options"></div>
                    </div>
                    <div id="quiz-feedback"></div>
                    <div class="quiz-footer-actions">
                        <button id="prev-question-btn" type="button"></button>
                        <button id="submit-answer-btn" type="button"></button>
                        <button id="next-question-btn" type="button"></button>
                        <button id="finish-exam-btn" type="button"></button>
                    </div>
                </div>
                <div id="quiz-score"></div>
            </div>
        </div>
        <div id="parent-test-modal" class="modal" aria-hidden="true">
            <div class="modal-content">
                <h2>父级弹窗</h2>
                <button id="parent-trigger-btn" type="button">触发确认框</button>
            </div>
        </div>
    `;

    return {
        HTMLElement: MiniElement,
        document: doc,
        window: {
            scrollTo: () => {},
            innerWidth: 1280,
            addEventListener: () => {},
            removeEventListener: () => {},
            location: { hash: '' }
        }
    };
}

globalThis.localStorage = createMemoryStorage();
const domEnv = createDomEnvironment();
globalThis.HTMLElement = domEnv.HTMLElement;
globalThis.document = domEnv.document;
globalThis.window = domEnv.window;
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);

const { state, processData } = await import('../js/state.js');
const { openModal, closeModal, confirmDialog } = await import('../js/modal.js');
const {
    recordWrongAnswer,
    recordCorrectPractice,
    getWrongAnswerQids
} = await import('../js/storage.js');
const {
    startQuiz,
    setSheetDraftAnswer,
    jumpToQuizQuestion,
    prevQuizQuestion,
    toggleQuizFlag,
    finishExamQuiz,
    startAllWrongAnswersTest,
    getQuizDraftAnswers
} = await import('../js/quiz.js');
const { showAllFavorites, toggleFavorite } = await import('../js/ui.js');

function resetSampleData() {
    globalThis.localStorage.clear();
    state.favorites = [];
    state.wrongAnswersByChapter = {};
    state.userStats = { total: 0, correct: 0, practicedQids: [], chapterStats: {} };
    state.questionEdits = {};
    state.questionAdditions = {};
    state.wrongStatusFilter = 'pending';
    state.quizState = 'IDLE';
    state.quizFinalized = false;

    processData({
        mcq: [
            {
                id: 'mcq_ch01_001',
                chapter: '第一章 总论',
                question: '1、构件是机械中独立的( )单元。',
                options: ['A．制造', 'B．运动', 'C．分析'],
                answer: 'B',
                explanation: '构件是运动单元。'
            },
            {
                id: 'mcq_ch02_001',
                chapter: '第二章 联接',
                question: '1、螺纹自锁条件是( )。',
                options: ['A．导程角小于当量摩擦角', 'B．导程角大于当量摩擦角', 'C．无要求'],
                answer: 'A',
                explanation: '导程角小于当量摩擦角时自锁。'
            }
        ],
        tf: [
            {
                id: 'tf_ch01_001',
                chapter: '第一章 总论',
                question: '1、所有机构自由度均大于0。',
                answer: '×',
                explanation: '静定桁架自由度为0。'
            }
        ]
    });
}

test('modal stack sets background inert and returns focus to parent modal on nested close', async () => {
    const parentTrigger = document.getElementById('parent-trigger-btn');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');

    openModal('parent-test-modal');
    assert.equal(sidebar.inert, true);
    assert.equal(mainContent.inert, true);

    parentTrigger.focus();
    const confirmPromise = confirmDialog({
        title: '测试嵌套确认框',
        message: '确认后应归还焦点给父级弹窗按钮'
    });
    assert.equal(document.getElementById('app-confirm-modal').classList.contains('is-open'), true);

    // 模拟点击确认按钮关闭子弹窗
    const confirmBtn = document.querySelector('[data-confirm-choice="confirm"]');
    confirmBtn.dispatchEvent({ type: 'click', bubbles: true });
    const confirmed = await confirmPromise;
    assert.equal(confirmed, true);
    assert.equal(document.activeElement, parentTrigger, 'Focus must return to parent modal trigger instead of body');
    assert.equal(sidebar.inert, true, 'Background remains inert while parent modal is open');

    closeModal('parent-test-modal');
    assert.equal(sidebar.inert, false);
    assert.equal(mainContent.inert, false);
});

test('mastered wrong answers are excluded from pending wrong tests unless filter is set to all', () => {
    resetSampleData();
    const q1 = state.question_lookup['mcq_ch01_001'];
    const q2 = state.question_lookup['mcq_ch02_001'];

    recordWrongAnswer(q1, '单元测试');
    recordWrongAnswer(q2, '单元测试');
    // 让 q1 连续答对 3 次达到 mastered
    recordCorrectPractice(q1);
    recordCorrectPractice(q1);
    recordCorrectPractice(q1);

    assert.deepEqual(getWrongAnswerQids(null, { status: 'pending' }), ['mcq_ch02_001']);
    assert.deepEqual(getWrongAnswerQids(null, { status: 'all' }).sort(), ['mcq_ch01_001', 'mcq_ch02_001'].sort());

    state.wrongStatusFilter = 'pending';
    startAllWrongAnswersTest();
    assert.deepEqual(state.quizQuestions.map(q => q.qid), ['mcq_ch02_001']);
    closeModal('quiz-modal');

    state.wrongStatusFilter = 'all';
    startAllWrongAnswersTest();
    assert.equal(state.quizQuestions.length, 2);
    closeModal('quiz-modal');
});

test('sheet mode exam preserves drafts across navigation, supports flagging, and grades on submit', async () => {
    resetSampleData();
    const pool = [
        state.question_lookup['mcq_ch01_001'], // 答案 B
        state.question_lookup['mcq_ch02_001'], // 答案 A
        state.question_lookup['tf_ch01_001']   // 答案 ×
    ];

    startQuiz(pool, 3, '模拟考试全卷模式测试', { alreadyShuffled: true, delivery: 'sheet' });
    assert.equal(state.quizDelivery, 'sheet');
    assert.equal(document.getElementById('quiz-sheet-nav').children.length, 3);
    assert.ok(document.getElementById('keyboard-instructions').textContent.includes('A/B/C 或 1-3'));

    // 第 1 题选 B (正确) 并标记存疑
    setSheetDraftAnswer(0, 'B');
    toggleQuizFlag();
    assert.equal(document.getElementById('quiz-flag-btn').classList.contains('is-flagged'), true);

    // 跳转到第 3 题选 ✓ (错误)
    jumpToQuizQuestion(2);
    assert.equal(state.currentQuestionIndex, 2);
    setSheetDraftAnswer(2, '✓');

    // 切到第 2 题选 A (正确) 并切回第 1 题检查草稿仍在
    prevQuizQuestion();
    assert.equal(state.currentQuestionIndex, 1);
    setSheetDraftAnswer(1, 'A');
    prevQuizQuestion();
    assert.deepEqual(getQuizDraftAnswers(), ['B', 'A', '✓']);

    // 全部作答后直接交卷结算
    await finishExamQuiz();
    assert.equal(state.quizFinalized, true);
    assert.equal(state.score, 2);
    assert.equal(state.lastWrongQuizQuestions.map(q => q.qid).join(','), 'tf_ch01_001');
    assert.deepEqual(getWrongAnswerQids(null, { status: 'pending' }), ['tf_ch01_001']);
    assert.equal(document.getElementById('quiz-score').style.display, 'block');
    assert.equal(document.querySelectorAll('.quiz-review-item').length, 3);
    closeModal('quiz-modal');
});

test('toggleFavorite from quiz modal removes question card and index item cleanly in favorites view', () => {
    resetSampleData();
    state.favorites = ['mcq_ch01_001', 'mcq_ch02_001'];

    showAllFavorites({ updateRoute: false });
    assert.equal(document.querySelectorAll('.question-list .question-block').length, 2);
    assert.equal(document.querySelectorAll('.question-index-item').length, 2);

    const quizFavBtn = document.getElementById('quiz-favorite-btn');
    quizFavBtn.dataset.qid = 'mcq_ch01_001';
    toggleFavorite('mcq_ch01_001', quizFavBtn);

    assert.deepEqual(state.favorites, ['mcq_ch02_001']);
    assert.equal(document.querySelectorAll('.question-list .question-block').length, 1, 'Card must also be removed when toggled from quiz modal');
    assert.equal(document.querySelectorAll('.question-index-item').length, 1, 'Index item count must stay aligned with cards');
});
