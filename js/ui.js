import { state } from './state.js';
import { typesetMath } from './utils.js';
import { disposeMechanismCanvas, initMechanismCanvas } from './mechanism.js?v=20260924-awwwards-redesign';
import {
    getWrongAnswerEntries,
    getWrongAnswerQids,
    removeWrongAnswerRecord,
    saveFavorites,
    saveWrongAnswers,
    WALLPAPER_KEY
} from './storage.js';
import {
    copyQuestionSyncPayload,
    discardQuestionAddition,
    discardQuestionEdit,
    downloadQuestionSyncPayload,
    getQuestionEditCount,
    getQuestionSyncPayload,
    hasQuestionAddition,
    hasQuestionEdit,
    openQuestionSyncIssue,
    saveQuestionAddition,
    saveQuestionEdit
} from './questionEdits.js';

const CUSTOM_CHAPTER_VALUE = '__custom_chapter__';
let questionIndexView = 'list';
let questionIndexScrollHandler = null;
let questionIndexResizeHandler = null;
let questionIndexFrame = null;
let chapterRailFrame = null;

function stopQuestionIndexTracking() {
    if (questionIndexFrame !== null) {
        cancelAnimationFrame(questionIndexFrame);
        questionIndexFrame = null;
    }
    if (questionIndexScrollHandler) {
        window.removeEventListener('scroll', questionIndexScrollHandler);
        questionIndexScrollHandler = null;
    }
    if (questionIndexResizeHandler) {
        window.removeEventListener('resize', questionIndexResizeHandler);
        questionIndexResizeHandler = null;
    }
}

function sizeQuestionIndex() {
    const panel = document.querySelector('.question-index');
    if (!panel) return;
    if (window.matchMedia('(max-width: 720px)').matches) {
        panel.style.height = '';
        return;
    }
    const top = Math.max(20, panel.getBoundingClientRect().top);
    const height = `${Math.max(280, window.innerHeight - top - 20)}px`;
    if (panel.style.height !== height) panel.style.height = height;
}

function sizeChapterRail() {
    const rail = document.querySelector('.chapter-rail');
    if (!rail) return;
    if (window.matchMedia('(max-width: 720px)').matches) {
        rail.style.height = '';
        return;
    }
    const top = Math.max(20, rail.getBoundingClientRect().top);
    const height = `${Math.max(80, window.innerHeight - top - 20)}px`;
    if (rail.style.height !== height) rail.style.height = height;
}

function scheduleChapterRailSize() {
    if (chapterRailFrame !== null) return;
    chapterRailFrame = requestAnimationFrame(() => {
        chapterRailFrame = null;
        sizeChapterRail();
    });
}

function getChapterOrder(chapterName) {
    const match = chapterName.match(/第(\S+)章/);
    if (!match) return Number.MAX_SAFE_INTEGER;
    const raw = match[1];
    const numberMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (/^\d+$/.test(raw)) return Number(raw);
    if (raw === '十') return 10;
    if (raw.startsWith('十')) return 10 + (numberMap[raw.slice(1)] || 0);
    if (raw.includes('十')) {
        const [ten, one] = raw.split('十');
        return (numberMap[ten] || 1) * 10 + (numberMap[one] || 0);
    }
    return numberMap[raw] || Number.MAX_SAFE_INTEGER;
}

function getSearchTerms(query) {
    return query.trim().split(/\s+/).filter(Boolean);
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeAttribute(text) {
    return String(text || '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

function formatInlineHtml(text, terms = []) {
    let html = String(text || '').replace(/(\(|\（)\s*(\)|\）)/, ' (   ) ');
    terms.forEach(term => {
        if (!term) return;
        html = html.replace(new RegExp(`(${escapeRegExp(term)})`, 'gi'), '<mark class="search-highlight">$1</mark>');
    });
    if (typeof DOMPurify !== 'undefined') {
        html = DOMPurify.sanitize(html, {
            ADD_TAGS: ['mark'],
            ADD_ATTR: ['class']
        });
    }
    return html;
}

function getWrongStatusLabel(status) {
    const labels = {
        unmastered: '未掌握',
        reviewing: '巩固中',
        mastered: '已掌握'
    };
    return labels[status] || '未掌握';
}

export function setupMobileMenu() {
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const notepadToggle = document.getElementById('notepad-toggle');
    const rightSidebar = document.getElementById('right-sidebar');

    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        document.body.classList.toggle('sidebar-open');
        if (document.body.classList.contains('right-sidebar-open')) {
            document.body.classList.remove('right-sidebar-open');
        }
    });

    sidebar.addEventListener('click', (event) => {
        if (event.target.closest('button') && window.innerWidth <= 992) {
            document.body.classList.remove('sidebar-open');
        }
    });
    
    document.addEventListener('click', (event) => {
        const isClickInsideLeft = sidebar.contains(event.target) || menuToggle.contains(event.target);
        const isClickInsideRight = rightSidebar.contains(event.target) || notepadToggle.contains(event.target);
        
        if (!isClickInsideLeft && document.body.classList.contains('sidebar-open')) {
            document.body.classList.remove('sidebar-open');
        }
        
        if (!isClickInsideRight && document.body.classList.contains('right-sidebar-open')) {
            document.body.classList.remove('right-sidebar-open');
        }
    });
    window.addEventListener('scroll', scheduleChapterRailSize, { passive: true });
    window.addEventListener('resize', scheduleChapterRailSize);
}

export function setupSearchFilters() {
    const searchInput = document.getElementById('global-search');
    const searchContainer = searchInput ? searchInput.closest('.search-container') : null;
    if (!searchContainer || document.getElementById('search-filter-bar')) return;

    const filterBar = document.createElement('div');
    filterBar.id = 'search-filter-bar';
    filterBar.className = 'search-filter-bar';
    filterBar.innerHTML = `
        <div class="search-select-row">
            <select id="search-type-filter" aria-label="题型筛选">
                <option value="all">全部题型</option>
                <option value="mcq">只看选择题</option>
                <option value="tf">只看判断题</option>
            </select>
            <select id="search-scope-filter" aria-label="范围筛选">
                <option value="all">全部题目</option>
                <option value="favorites">只搜收藏</option>
                <option value="wrong">只搜错题</option>
            </select>
        </div>
        <div class="search-chapter-filter">
            <div class="search-chapter-filter-title">
                <span>章节范围</span>
                <span>
                    <button type="button" class="text-button" id="search-chapter-select-all">全选</button>
                    <button type="button" class="text-button" id="search-chapter-clear-all">清空</button>
                </span>
            </div>
            <div id="search-chapter-options" class="search-chapter-options"></div>
        </div>
    `;
    searchContainer.appendChild(filterBar);

    const chapterOptions = filterBar.querySelector('#search-chapter-options');
    Object.keys(state.all_data)
        .sort((a, b) => getChapterOrder(a) - getChapterOrder(b))
        .forEach(chapterName => {
            const label = document.createElement('label');
            label.className = 'search-chapter-option';
            const checkbox = Object.assign(document.createElement('input'), {
                type: 'checkbox',
                name: 'search-chapter',
                value: chapterName,
                checked: true
            });
            const text = document.createElement('span');
            text.textContent = chapterName;
            label.append(checkbox, text);
            chapterOptions.appendChild(label);
        });

    filterBar.addEventListener('change', () => {
        filterQuestions(searchInput.value);
    });
    const searchModal = document.getElementById('search-modal');
    if (searchModal && !searchModal.dataset.searchEnterBound) {
        searchModal.dataset.searchEnterBound = 'true';
        searchModal.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.isComposing) return;
            event.preventDefault();
            filterQuestions(searchInput.value);
            closeSearchModal();
        });
    }
    filterBar.querySelector('#search-chapter-select-all').addEventListener('click', () => {
        filterBar.querySelectorAll('input[name="search-chapter"]').forEach(input => { input.checked = true; });
        filterQuestions(searchInput.value);
    });
    filterBar.querySelector('#search-chapter-clear-all').addEventListener('click', () => {
        filterBar.querySelectorAll('input[name="search-chapter"]').forEach(input => { input.checked = false; });
        filterQuestions(searchInput.value);
    });
}

export function updateChapterNavStatus() {
    document.querySelectorAll('#chapter-nav-list details').forEach(detail => {
        const chapterName = detail.dataset.chapterName;
        const wrongBtn = detail.querySelector('.chapter-wrong-button');
        const wrongCount = getWrongAnswerQids(chapterName).length;
        if (wrongCount > 0) {
            wrongBtn.textContent = `本章错题 (${wrongCount})`;
            wrongBtn.disabled = false;
        } else {
            wrongBtn.textContent = '本章错题 (0)';
            wrongBtn.disabled = true;
        }
    });
    syncQuestionIndexMarkers();
}

export function updateGlobalControls(show, options = {}) {
    if (show) {
        document.body.classList.remove('home-view');
        disposeMechanismCanvas();
    }
    document.getElementById('global-controls').style.display = show ? 'flex' : 'none';
    scheduleChapterRailSize();
    if (!show) return;

    document.getElementById('toggle-favorites-btn').style.display = 'none';
    document.getElementById('clear-chapter-wrong-answers-btn').style.display = 'none';
    document.getElementById('test-chapter-wrong-btn').style.display = 'none';
    document.getElementById('test-all-wrong-btn').style.display = 'none';
    document.getElementById('clear-all-wrong-answers-btn').style.display = 'none';
    
    if (options.showFavoriteFilter) document.getElementById('toggle-favorites-btn').style.display = 'inline-block';
    if (options.showChapterWrongClear) document.getElementById('clear-chapter-wrong-answers-btn').style.display = 'inline-block';
    if (options.showChapterWrongTest) document.getElementById('test-chapter-wrong-btn').style.display = 'inline-block';
    if (options.showAllWrongClear) document.getElementById('clear-all-wrong-answers-btn').style.display = 'inline-block';
    if (options.showAllWrongTest) document.getElementById('test-all-wrong-btn').style.display = 'inline-block';
    
    const answerBtn = document.getElementById('toggle-all-answers-btn');
    const favoriteBtn = document.getElementById('toggle-favorites-btn');
    answerBtn.textContent = '显示全部答案';
    answerBtn.dataset.state = 'hidden';
    favoriteBtn.textContent = '只显示收藏';
    favoriteBtn.dataset.state = 'all';
}

export function createNavigationAndContent() {
    const chapterNavList = document.getElementById('chapter-nav-list');
    const contentArea = document.getElementById('content-area');
    chapterNavList.innerHTML = '';
    contentArea.innerHTML = '';

    Object.keys(state.all_data).sort((a, b) => getChapterOrder(a) - getChapterOrder(b)).forEach(chapterName => {
        const details = document.createElement('details');
        details.dataset.chapterName = chapterName;
        
        const summary = document.createElement('summary');
        summary.textContent = chapterName;
        const chevron = document.createElement('i');
        chevron.dataset.lucide = 'chevron-right';
        chevron.className = 'chapter-chevron';
        summary.appendChild(chevron);
        details.appendChild(summary);

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'chapter-button-container';
        
        const wrongBtn = document.createElement('button');
        wrongBtn.className = 'chapter-wrong-button';
        wrongBtn.dataset.chapter = chapterName;
        wrongBtn.dataset.action = 'showChapterWrongAnswers';
        buttonContainer.appendChild(wrongBtn);
        
        const mcqBtn = document.createElement('button');
        mcqBtn.className = 'chapter-type-button';
        mcqBtn.innerHTML = '<i data-lucide="list"></i> 选择题';
        mcqBtn.dataset.chapter = chapterName;
        mcqBtn.dataset.type = 'mcq';
        mcqBtn.dataset.action = 'showQuestions';
        buttonContainer.appendChild(mcqBtn);

        const tfBtn = document.createElement('button');
        tfBtn.className = 'chapter-type-button';
        tfBtn.innerHTML = '<i data-lucide="check-check"></i> 判断题';
        tfBtn.dataset.chapter = chapterName;
        tfBtn.dataset.type = 'tf';
        tfBtn.dataset.action = 'showQuestions';
        buttonContainer.appendChild(tfBtn);

        const testBtn = document.createElement('button');
        testBtn.className = 'chapter-test-button';
        testBtn.innerHTML = '<i data-lucide="flask-conical"></i> 本章测试';
        testBtn.dataset.chapter = chapterName;
        testBtn.dataset.action = 'startChapterTest';
        buttonContainer.appendChild(testBtn);

        details.appendChild(buttonContainer);
        chapterNavList.appendChild(details);
    });

    updateChapterNavStatus();
    showHome();
}

function renderWelcomeOverview() {
    const chapters = Object.keys(state.all_data).sort((a, b) => getChapterOrder(a) - getChapterOrder(b));
    const totalQuestions = chapters.reduce((sum, chapter) => {
        const group = state.all_data[chapter];
        return sum + group.mcq.length + group.tf.length;
    }, 0);
    const completed = state.userStats.total;
    const accuracy = completed ? Math.round(state.userStats.correct / completed * 100) : 0;
    const firstChapter = chapters.find(chapter => state.all_data[chapter].mcq.length) || chapters[0];
    const welcome = document.getElementById('welcome-message');

    welcome.innerHTML = `
        <section class="welcome-stage" aria-label="练习概览">
            <div class="stage-copy">
                <div class="stage-heading"><span class="stage-rule"></span><span>课程自测 / 章节练习</span></div>
                <h2>从题出发，<br>理解机械。</h2>
                <div class="stage-actions">
                    <button type="button" class="stage-primary" data-action="showQuestions" data-chapter="${escapeAttribute(firstChapter || '')}" data-type="mcq">开始章节练习 <i data-lucide="arrow-up-right"></i></button>
                    <button type="button" class="stage-secondary" data-action="startMockExam"><i data-lucide="timer"></i> 模拟考试</button>
                </div>
                <div class="stage-metrics">
                    <div><strong>${totalQuestions}</strong><span>题库题目</span></div>
                    <div><strong>${completed}</strong><span>累计练习</span></div>
                    <div><strong>${accuracy}%</strong><span>练习正确率</span></div>
                </div>
            </div>
            <div class="mechanism-visual">
                <canvas id="mechanism-canvas" role="img" aria-label="可拖动的啮合行星齿轮示意图"></canvas>
                <span class="mechanism-label mechanism-label-top">行星轮系机构 / 18 : 15 : 48</span>
                <span class="mechanism-label mechanism-label-bottom">太阳轮 · 行星轮 · 内齿圈</span>
            </div>
        </section>
        <section class="chapter-index" aria-labelledby="chapter-index-title">
            <div class="chapter-index-heading">
                <div><span class="section-kicker">按章节练习</span><h2 id="chapter-index-title">章节索引</h2></div>
                <span class="chapter-total">${chapters.length} 章 / ${totalQuestions} 题</span>
            </div>
            <div class="chapter-grid">
                ${chapters.map((chapter, index) => {
                    const group = state.all_data[chapter];
                    const count = group.mcq.length + group.tf.length;
                    const label = chapter.replace(/^第[^章]+章\s*/, '');
                    return `<div class="chapter-row">
                        <button type="button" class="chapter-main" data-action="showQuestions" data-chapter="${escapeAttribute(chapter)}" data-type="mcq" aria-label="${escapeAttribute(chapter)}选择题">
                            <span class="chapter-number">${String(index + 1).padStart(2, '0')}</span>
                            <span class="chapter-name">${escapeAttribute(label)}</span>
                            <span class="chapter-count">${count} 题</span>
                        </button>
                        <div class="chapter-row-actions">
                            <button type="button" data-action="showQuestions" data-chapter="${escapeAttribute(chapter)}" data-type="mcq" title="${escapeAttribute(chapter)}选择题" aria-label="${escapeAttribute(chapter)}选择题"><i data-lucide="list"></i></button>
                            <button type="button" data-action="showQuestions" data-chapter="${escapeAttribute(chapter)}" data-type="tf" title="${escapeAttribute(chapter)}判断题" aria-label="${escapeAttribute(chapter)}判断题"><i data-lucide="check-check"></i></button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </section>
    `;
    initMechanismCanvas();
}

export function showHome() {
    stopQuestionIndexTracking();
    state.activeChapter = null;
    state.activeType = null;
    if (state.activeChapterButton) {
        state.activeChapterButton.classList.remove('active');
        state.activeChapterButton = null;
    }
    const searchInput = document.getElementById('global-search');
    if (searchInput) searchInput.value = '';
    const typeFilter = document.getElementById('search-type-filter');
    const scopeFilter = document.getElementById('search-scope-filter');
    if (typeFilter) typeFilter.value = 'all';
    if (scopeFilter) scopeFilter.value = 'all';
    document.querySelectorAll('input[name="search-chapter"]').forEach(input => { input.checked = true; });
    document.getElementById('main-title').textContent = '机械设计基础';
    document.getElementById('content-area').innerHTML = '';
    document.getElementById('welcome-message').style.display = 'block';
    updateGlobalControls(false);
    document.body.classList.add('home-view');
    renderWelcomeOverview();
    scheduleChapterRailSize();
    document.body.classList.remove('sidebar-open');
    window.scrollTo(0, 0);
}

export function renderQuestions(questionsList, options = {}) {
    const contentArea = document.getElementById('content-area');
    stopQuestionIndexTracking();
    contentArea.innerHTML = '';
    state.currentQuestionList = questionsList;
    state.currentRenderOptions = { ...options };
    if (!questionsList.length) return [];

    const workspace = document.createElement('div');
    workspace.className = 'question-workspace';
    const indexPanel = document.createElement('aside');
    indexPanel.className = 'question-index';
    indexPanel.setAttribute('aria-label', '题目索引');
    indexPanel.innerHTML = `
        <div class="question-index-header">
            <div class="question-index-heading"><strong>题目索引</strong><span class="question-index-count"></span></div>
            <div class="question-index-modes" role="group" aria-label="索引视图">
                <button type="button" data-action="setQuestionIndexView" data-view="list" aria-label="列表视图" title="列表视图"><i data-lucide="list"></i></button>
                <button type="button" data-action="setQuestionIndexView" data-view="grid" aria-label="网格视图" title="网格视图"><i data-lucide="layout-grid"></i></button>
            </div>
        </div>
        <nav class="question-index-items" aria-label="跳转到题目"></nav>
    `;
    const indexItems = indexPanel.querySelector('.question-index-items');
    const questionList = document.createElement('div');
    questionList.className = 'question-list';
    const visibleBlocks = [];

    questionsList.forEach((item, index) => {
        const block = createQuestionBlock(item, options);
        block.classList.add('visible');
        block.id = `question-${index + 1}`;
        questionList.appendChild(block);
        visibleBlocks.push(block);

        const title = block.querySelector('p')?.textContent.replace(/^\s*\d+\s*[、.．]\s*/, '').replace(/\s+/g, ' ').trim() || `第 ${index + 1} 题`;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'question-index-item';
        button.dataset.action = 'jumpToQuestion';
        button.dataset.qid = item.qid;
        button.dataset.number = String(index + 1);
        button.title = title;
        button.setAttribute('aria-label', `第 ${index + 1} 题：${title}`);
        const number = document.createElement('span');
        number.className = 'question-index-number';
        number.textContent = String(index + 1).padStart(2, '0');
        const label = document.createElement('span');
        label.className = 'question-index-label';
        if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            label.innerHTML = DOMPurify.sanitize(marked.parseInline(title));
        } else {
            label.textContent = title;
        }
        button.append(number, label);
        const status = document.createElement('span');
        status.className = 'question-index-status';
        status.setAttribute('aria-hidden', 'true');
        button.appendChild(status);
        indexItems.appendChild(button);
    });

    workspace.append(indexPanel, questionList);
    contentArea.appendChild(workspace);
    syncQuestionIndexMarkers();
    scheduleChapterRailSize();
    setQuestionIndexView(questionIndexView);
    updateQuestionIndexCount();
    if (questionsList.length) setActiveQuestionIndex(questionsList[0].qid);
    trackQuestionBlocks(visibleBlocks);
    typesetMath([questionList, indexItems]);
    return visibleBlocks;
}

export function setQuestionIndexView(view) {
    if (view !== 'list' && view !== 'grid') return;
    questionIndexView = view;
    const indexItems = document.querySelector('.question-index-items');
    if (!indexItems) return;
    indexItems.dataset.view = view;
    document.querySelectorAll('.question-index-modes button').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.view === view));
    });
}

function syncQuestionIndexMarkers() {
    const favoriteQids = new Set(state.favorites);
    const wrongQids = new Set(getWrongAnswerQids());
    document.querySelectorAll('.question-index-item').forEach(button => {
        const isFavorite = favoriteQids.has(button.dataset.qid);
        const isWrong = wrongQids.has(button.dataset.qid);
        const status = button.querySelector('.question-index-status');
        if (!status) return;
        status.innerHTML = `${isFavorite ? '<i data-lucide="star" class="question-index-favorite"></i>' : ''}${isWrong ? '<i data-lucide="circle-alert" class="question-index-wrong"></i>' : ''}`;
        const labels = [isFavorite && '已收藏', isWrong && '错题'].filter(Boolean);
        button.setAttribute('aria-label', `第 ${button.dataset.number} 题：${button.title}${labels.length ? `（${labels.join('、')}）` : ''}`);
    });
}

function setActiveQuestionIndex(qid) {
    document.querySelectorAll('.question-index-item').forEach(button => {
        const active = button.dataset.qid === qid;
        button.classList.toggle('active', active);
        if (active) button.setAttribute('aria-current', 'location');
        else button.removeAttribute('aria-current');
    });
}

function updateQuestionIndexCount() {
    const count = document.querySelector('.question-index-count');
    if (!count) return;
    const items = Array.from(document.querySelectorAll('.question-index-item'));
    const visible = items.filter(item => !item.hidden).length;
    count.textContent = visible === items.length ? `${visible} 题` : `${visible} / ${items.length} 题`;
}

function trackQuestionBlocks(blocks) {
    stopQuestionIndexTracking();
    const visible = blocks.filter(block => getComputedStyle(block).display !== 'none');
    if (!visible.length) return;

    const updateActive = () => {
        questionIndexFrame = null;
        sizeQuestionIndex();
        let current = visible[0];
        if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
            current = visible[visible.length - 1];
        } else {
            const activationLine = Math.min(160, window.innerHeight * 0.25);
            for (const block of visible) {
                if (block.getBoundingClientRect().top > activationLine) break;
                current = block;
            }
        }
        setActiveQuestionIndex(current.dataset.qid);
    };
    questionIndexScrollHandler = () => {
        if (questionIndexFrame !== null) return;
        questionIndexFrame = requestAnimationFrame(updateActive);
    };
    window.addEventListener('scroll', questionIndexScrollHandler, { passive: true });
    questionIndexResizeHandler = sizeQuestionIndex;
    window.addEventListener('resize', questionIndexResizeHandler);
    updateActive();
}

function syncQuestionIndexVisibility() {
    const blocks = Array.from(document.querySelectorAll('.question-list .question-block'));
    const blocksById = new Map(blocks.map(block => [block.dataset.qid, block]));
    document.querySelectorAll('.question-index-item').forEach(button => {
        const block = blocksById.get(button.dataset.qid);
        button.hidden = !block || getComputedStyle(block).display === 'none';
    });
    updateQuestionIndexCount();
    trackQuestionBlocks(blocks);
    const active = document.querySelector('.question-index-item.active:not([hidden])');
    if (!active) {
        const first = document.querySelector('.question-index-item:not([hidden])');
        setActiveQuestionIndex(first?.dataset.qid);
    }
}

function removeQuestionFromIndex(qid) {
    const button = Array.from(document.querySelectorAll('.question-index-item')).find(item => item.dataset.qid === qid);
    button?.remove();
    state.currentQuestionList = state.currentQuestionList.filter(item => item.qid !== qid);
    document.querySelectorAll('.question-index-item').forEach((item, index) => {
        const number = index + 1;
        item.dataset.number = String(number);
        item.querySelector('.question-index-number').textContent = String(number).padStart(2, '0');
    });
    syncQuestionIndexMarkers();
    syncQuestionIndexVisibility();
}

export function jumpToQuestion(qid) {
    const block = Array.from(document.querySelectorAll('.question-list .question-block'))
        .find(item => item.dataset.qid === qid && getComputedStyle(item).display !== 'none');
    if (!block) return;
    setActiveQuestionIndex(qid);
    block.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function createQuestionBlock(item, options = {}) {
    const block = document.createElement('div');
    block.className = 'question-block';
    block.dataset.qid = item.qid;
    block.dataset.chapter = item.chapter;
    block.dataset.type = item.type;
    const hasLocalEdit = hasQuestionEdit(item.qid);
    const hasLocalAddition = hasQuestionAddition(item.qid);
    if (hasLocalEdit) {
        block.classList.add('has-local-edit');
    }
    if (hasLocalAddition) {
        block.classList.add('has-local-addition');
    }

    let explanationHtml = '';
    if (item.explanation) {
        // DOMPurify and marked will be available globally as they are added via CDN to global scope.
        explanationHtml = (typeof marked !== 'undefined' && marked.parse) ? marked.parse(item.explanation) : item.explanation;
        if (typeof DOMPurify !== 'undefined') {
            explanationHtml = DOMPurify.sanitize(explanationHtml);
        }
    }

    const isFav = state.favorites.includes(item.qid);
    const wrongRecord = (state.wrongAnswersByChapter[item.chapter] || {})[item.qid];
    const searchTerms = options.searchTerms || [];
    const questionHtml = formatInlineHtml(item.question, searchTerms);
    const wrongMetaHtml = wrongRecord ? `
        <div class="wrong-meta">
            <span>${getWrongStatusLabel(wrongRecord.status)}</span>
            <span>错 ${wrongRecord.wrongCount || 1} 次</span>
            <span>连续答对 ${wrongRecord.correctStreak || 0} 次</span>
        </div>
    ` : '';
    const editBadgeHtml = hasLocalAddition
        ? '<span class="local-add-badge"><i data-lucide="plus"></i> 本地新增</span>'
        : (hasLocalEdit ? '<span class="local-edit-badge"><i data-lucide="pen"></i> 本地修订</span>' : '');
    const editAction = hasLocalAddition ? 'openQuestionEntryEditor' : 'openQuestionEditor';
    const typeLabel = item.type === 'mcq' ? 'MCQ // 选择题' : 'TF // 判断题';
    const optionsHtml = item.type === 'mcq' ? `
        <ul class="question-options-list">
            ${item.options.map(o => {
                const formatted = formatInlineHtml(o, searchTerms);
                const match = formatted.match(/^([A-Za-z][\.\、\s]*)(.*)$/);
                if (match) {
                    return `<li><span class="opt-key">${match[1].replace(/[\.\、\s]+$/, '')}</span><span class="opt-val">${match[2]}</span></li>`;
                }
                return `<li>${formatted}</li>`;
            }).join('')}
        </ul>
    ` : '';

    block.innerHTML = `
        <div class="question-header-meta">
            <span class="question-type-badge">${typeLabel}</span>
            <span class="question-id-badge">ID: ${escapeAttribute(item.qid)}</span>
        </div>
        <p class="question-stem">${questionHtml}</p>
        ${editBadgeHtml}
        ${wrongMetaHtml}
        ${optionsHtml}
        <div class="action-buttons-container">
            <button class="action-button" data-action="toggleAnswer" data-state="hidden"><i data-lucide="eye"></i> 显示答案</button>
            <span class="answer-span"><strong class="answer-badge">标准答案</strong> ${item.answer}</span>
            <div class="explanation-span">${explanationHtml ? `<div class="explanation-title"><i data-lucide="book-marked"></i> 工程解析与校核</div><div class="explanation-body">${explanationHtml}</div>` : ''}</div>
            <button class="action-button favorite-button ${isFav ? 'favorited' : ''}" data-qid="${item.qid}" data-action="toggleFavorite">${isFav ? '<i data-lucide="star"></i> 已收藏' : '<i data-lucide="star"></i> 收藏'}</button>
            <button class="action-button edit-question-button" data-qid="${item.qid}" data-action="${editAction}"><i data-lucide="square-pen"></i> ${editLabel}</button>
            <button class="action-button remove-wrong-answer-btn" data-qid="${item.qid}" data-chapter="${item.chapter}" data-action="removeWrongAnswer"><i data-lucide="trash-2"></i> 移除此题</button>
        </div>
    `;
    return block;
}

function refreshRenderedQuestions() {
    if (!state.currentQuestionList.length) return;
    const visibleBlocks = renderQuestions(state.currentQuestionList, state.currentRenderOptions);
    visibleBlocks.forEach(block => {
        const removeBtn = block.querySelector('.remove-wrong-answer-btn');
        if (removeBtn) {
            removeBtn.style.display = state.currentRenderOptions.mode === 'wrong' ? 'inline-block' : 'none';
        }
    });
    updateQuestionEditSummary();
}

function findChapterTypeButton(chapter, type) {
    return Array.from(document.querySelectorAll('[data-action="showQuestions"]'))
        .find(button => button.dataset.chapter === chapter && button.dataset.type === type);
}

function refreshQuestionChangeViews() {
    const activeChapter = state.activeChapter;
    const activeType = state.activeType;

    createNavigationAndContent();
    document.getElementById('search-filter-bar')?.remove();
    setupSearchFilters();

    if (activeChapter && activeType && state.all_data[activeChapter]) {
        showQuestions(activeChapter, activeType, findChapterTypeButton(activeChapter, activeType));
        return;
    }

    if (activeChapter && !state.all_data[activeChapter]) {
        state.activeChapter = null;
        state.activeType = null;
        state.currentQuestionList = [];
        state.currentRenderOptions = {};
        state.activeChapterButton = null;
        document.getElementById('content-area').innerHTML = '';
        document.getElementById('main-title').textContent = '欢迎使用机械设计基础题库自测';
        document.getElementById('welcome-message').style.display = 'block';
        document.getElementById('welcome-message').innerHTML = '<p>请从章节索引选择一个章节和题型开始练习。</p>';
        updateGlobalControls(false);
        updateQuestionEditSummary();
        return;
    }

    refreshRenderedQuestions();
    updateQuestionEditSummary();
}

function populateQuestionEntryChapters(selectedChapter = '') {
    const chapterSelect = document.getElementById('question-entry-chapter');
    const customChapterInput = document.getElementById('question-entry-custom-chapter');
    if (!chapterSelect || !customChapterInput) return;

    const chapters = Object.keys(state.all_data).sort((a, b) => getChapterOrder(a) - getChapterOrder(b));
    const targetChapter = selectedChapter || state.activeChapter || chapters[0] || '';
    chapterSelect.innerHTML = [
        ...chapters.map(chapter => `<option value="${escapeAttribute(chapter)}">${escapeAttribute(chapter)}</option>`),
        `<option value="${CUSTOM_CHAPTER_VALUE}">自定义章节...</option>`
    ].join('');

    if (chapters.includes(targetChapter)) {
        chapterSelect.value = targetChapter;
        customChapterInput.value = '';
    } else {
        chapterSelect.value = CUSTOM_CHAPTER_VALUE;
        customChapterInput.value = targetChapter;
    }
    updateQuestionEntryChapterField();
}

function getQuestionEntryChapterValue() {
    const chapterSelect = document.getElementById('question-entry-chapter');
    const customChapterInput = document.getElementById('question-entry-custom-chapter');
    if (!chapterSelect || !customChapterInput) return '';
    return chapterSelect.value === CUSTOM_CHAPTER_VALUE ? customChapterInput.value : chapterSelect.value;
}

export function updateQuestionEntryChapterField() {
    const chapterSelect = document.getElementById('question-entry-chapter');
    const customChapterInput = document.getElementById('question-entry-custom-chapter');
    if (!chapterSelect || !customChapterInput) return;

    const isCustom = chapterSelect.value === CUSTOM_CHAPTER_VALUE;
    customChapterInput.style.display = isCustom ? 'block' : 'none';
    customChapterInput.required = isCustom;
}

export function updateQuestionEntryTypeFields() {
    const type = document.getElementById('question-entry-type')?.value || 'mcq';
    const optionsField = document.getElementById('question-entry-options-field');
    const optionsInput = document.getElementById('question-entry-options');
    if (!optionsField || !optionsInput) return;

    if (type === 'mcq') {
        optionsField.style.display = 'grid';
    } else {
        optionsField.style.display = 'none';
        optionsInput.value = '';
    }
}

export function openQuestionEntryModal(defaults = {}) {
    const addition = defaults || {};
    const qid = addition.qid || '';
    document.getElementById('question-entry-qid').value = qid;
    document.getElementById('question-entry-type').value = addition.type || state.activeType || 'mcq';
    document.getElementById('question-entry-question').value = addition.question || '';
    document.getElementById('question-entry-options').value = Array.isArray(addition.options) ? addition.options.join('\n') : '';
    document.getElementById('question-entry-answer').value = addition.answer || '';
    document.getElementById('question-entry-explanation').value = addition.explanation || '';
    document.getElementById('question-entry-title').innerHTML = qid
        ? '<i data-lucide="square-pen"></i> 编辑录入题'
        : '<i data-lucide="square-plus"></i> 录入新题';
    document.getElementById('btn-save-question-entry').innerHTML = qid
        ? '<i data-lucide="save"></i> 保存录入'
        : '<i data-lucide="square-plus"></i> 保存新题';

    populateQuestionEntryChapters(addition.chapter || state.activeChapter || '');
    updateQuestionEntryTypeFields();
    document.getElementById('question-entry-modal').style.display = 'block';
    setTimeout(() => document.getElementById('question-entry-question')?.focus(), 0);
}

export function openQuestionEntryEditor(qid) {
    const addition = state.questionAdditions[qid];
    if (!addition) {
        openQuestionEditModal(qid);
        return;
    }
    openQuestionEntryModal({ ...addition, qid });
}

export function closeQuestionEntryModal() {
    document.getElementById('question-entry-modal').style.display = 'none';
}

export function handleQuestionEntrySubmit(event) {
    event.preventDefault();
    const qid = document.getElementById('question-entry-qid').value;
    try {
        saveQuestionAddition({
            chapter: getQuestionEntryChapterValue(),
            type: document.getElementById('question-entry-type').value,
            question: document.getElementById('question-entry-question').value,
            optionsText: document.getElementById('question-entry-options').value,
            answer: document.getElementById('question-entry-answer').value,
            explanation: document.getElementById('question-entry-explanation').value
        }, qid);
        closeQuestionEntryModal();
        refreshQuestionChangeViews();
        renderQuestionEditManager();
    } catch (error) {
        alert(error.message || '保存失败，请检查录入内容。');
    }
}

export function openQuestionEditModal(qid) {
    const question = state.question_lookup[qid];
    if (!question) return;

    document.getElementById('question-edit-qid').value = question.qid;
    document.getElementById('question-edit-question').value = question.question || '';
    document.getElementById('question-edit-answer').value = question.answer || '';
    document.getElementById('question-edit-explanation').value = question.explanation || '';

    const optionsField = document.getElementById('question-edit-options-field');
    const optionsInput = document.getElementById('question-edit-options');
    if (question.type === 'mcq') {
        optionsField.style.display = 'grid';
        optionsInput.value = (question.options || []).join('\n');
    } else {
        optionsField.style.display = 'none';
        optionsInput.value = '';
    }

    document.getElementById('btn-discard-question-edit').disabled = !hasQuestionEdit(question.qid);
    document.getElementById('question-edit-modal').style.display = 'block';
    setTimeout(() => document.getElementById('question-edit-question')?.focus(), 0);
}

export function closeQuestionEditModal() {
    document.getElementById('question-edit-modal').style.display = 'none';
}

export function handleQuestionEditSubmit(event) {
    event.preventDefault();
    const qid = document.getElementById('question-edit-qid').value;
    try {
        saveQuestionEdit(qid, {
            question: document.getElementById('question-edit-question').value,
            optionsText: document.getElementById('question-edit-options').value,
            answer: document.getElementById('question-edit-answer').value,
            explanation: document.getElementById('question-edit-explanation').value
        });
        closeQuestionEditModal();
        refreshRenderedQuestions();
        renderQuestionEditManager();
    } catch (error) {
        alert(error.message || '保存失败，请检查输入内容。');
    }
}

export function discardCurrentQuestionEdit() {
    const qid = document.getElementById('question-edit-qid').value;
    discardQuestionEditById(qid);
    closeQuestionEditModal();
}

export function discardQuestionEditById(qid) {
    if (!qid || !hasQuestionEdit(qid)) return;
    if (!confirm('确定要还原这道题的本地修订吗？')) return;
    discardQuestionEdit(qid);
    refreshRenderedQuestions();
    renderQuestionEditManager();
}

export function discardQuestionAdditionById(qid) {
    if (!qid || !hasQuestionAddition(qid)) return;
    if (!confirm('确定要删除这道本地新增题吗？')) return;
    discardQuestionAddition(qid);
    refreshQuestionChangeViews();
    renderQuestionEditManager();
}

export function showQuestionEditManager() {
    renderQuestionEditManager();
    document.getElementById('question-edit-manager-modal').style.display = 'block';
}

export function closeQuestionEditManager() {
    document.getElementById('question-edit-manager-modal').style.display = 'none';
}

export function updateQuestionEditSummary() {
    const button = document.querySelector('[data-action="showQuestionEditManager"]');
    if (!button) return;
    const count = getQuestionEditCount();
    button.innerHTML = `<i data-lucide="file-pen-line"></i> 题目修订/录入${count ? ` (${count})` : ''}`;
}

export function renderQuestionEditManager() {
    const summary = document.getElementById('question-edit-summary');
    const list = document.getElementById('question-edit-list');
    if (!summary || !list) return;

    const payload = getQuestionSyncPayload();
    summary.innerHTML = payload.changeCount
        ? `<strong>${payload.changeCount}</strong> 条本地题库变更，其中修订 ${payload.updateCount} 条、新增 ${payload.additionCount} 条，可申请同步到 <code>question.json</code>。`
        : '当前没有本地题目修订或新增题。';

    if (!payload.changeCount) {
        list.innerHTML = '<div class="empty-edit-state">在题卡上点击“编辑”可修订已有题；点击“录入新题”可新增题目，都会先保存在本机。</div>';
        updateQuestionEditSummary();
        return;
    }

    list.innerHTML = payload.changes.map(change => {
        const isAddition = change.operation === 'add';
        const title = formatInlineHtml(change.updated.question).replace(/<\/?p>/g, '');
        const typeLabel = change.type === 'mcq' ? '选择题' : '判断题';
        const operationLabel = isAddition ? '本地新增' : '本地修订';
        const editAction = isAddition ? 'openQuestionEntryEditor' : 'openQuestionEditor';
        const discardAction = isAddition ? 'discardQuestionAddition' : 'discardQuestionEdit';
        const discardLabel = isAddition ? '删除' : '还原';
        const discardIcon = isAddition ? 'trash-2' : 'rotate-ccw';
        return `
            <div class="question-edit-item">
                <div class="question-edit-item-main">
                    <span>${change.chapter} · ${typeLabel} · ${operationLabel}</span>
                    <strong>${title}</strong>
                    <small>答案：${formatInlineHtml(change.updated.answer)}</small>
                </div>
                <div class="question-edit-item-actions">
                    <button class="action-button" data-action="${editAction}" data-qid="${change.qid}"><i data-lucide="pen"></i> 编辑</button>
                    <button class="action-button remove-wrong-answer-btn" data-action="${discardAction}" data-qid="${change.qid}"><i data-lucide="${discardIcon}"></i> ${discardLabel}</button>
                </div>
            </div>
        `;
    }).join('');
    updateQuestionEditSummary();
}

export async function copyQuestionSyncRequest() {
    try {
        await copyQuestionSyncPayload();
        alert('同步申请 JSON 已复制到剪贴板。');
    } catch (error) {
        alert('复制失败，请改用下载同步申请。');
    }
}

export function downloadQuestionSyncRequest() {
    if (getQuestionEditCount() === 0) {
        alert('当前没有需要同步的本地修订或新增题。');
        return;
    }
    downloadQuestionSyncPayload();
}

export async function openQuestionSyncRequestIssue() {
    if (getQuestionEditCount() === 0) {
        alert('当前没有需要同步的本地修订或新增题。');
        return;
    }
    await openQuestionSyncIssue();
}

export function showQuestions(chapter, type, btn) {
    window.scrollTo(0, 0);
    state.activeChapter = chapter;
    state.activeType = type;

    document.getElementById('welcome-message').style.display = 'none';
    updateGlobalControls(true, { showFavoriteFilter: true });
    document.getElementById('main-title').textContent = `${chapter} - ${type === 'mcq' ? '选择题' : '判断题'}`;

    if (state.activeChapterButton) state.activeChapterButton.classList.remove('active');
    if (btn) {
        btn.classList.add('active');
        state.activeChapterButton = btn;
    }

    const questionsPool = type === 'mcq' ? (state.all_data[chapter] ? state.all_data[chapter].mcq : []) : (state.all_data[chapter] ? state.all_data[chapter].tf : []);
    const visibleBlocks = renderQuestions(questionsPool);
    
    visibleBlocks.forEach(block => {
        const removeBtn = block.querySelector('.remove-wrong-answer-btn');
        if (removeBtn) removeBtn.style.display = 'none';
    });
}

export function showChapterWrongAnswers(chapterName, btn) {
    window.scrollTo(0, 0);
    state.activeChapter = chapterName;
    state.activeType = null;
    
    document.getElementById('welcome-message').style.display = 'none';
    updateGlobalControls(true, { showChapterWrongClear: true, showChapterWrongTest: true });
    
    if (state.activeChapterButton) state.activeChapterButton.classList.remove('active');
    if (btn) {
        btn.classList.add('active');
        state.activeChapterButton = btn;
    }

    document.getElementById('main-title').textContent = `${chapterName} - 错题回顾`;

    const chapterWrongQids = getWrongAnswerQids(chapterName);
    const questionsList = chapterWrongQids.map(qid => state.question_lookup[qid]).filter(Boolean);
    const visibleBlocks = renderQuestions(questionsList, { mode: 'wrong' });
    
    visibleBlocks.forEach(block => {
        const removeBtn = block.querySelector('.remove-wrong-answer-btn');
        if (removeBtn) removeBtn.style.display = 'inline-block';
    });
    if (questionsList.length === 0) {
        updateGlobalControls(false);
        document.getElementById('content-area').innerHTML = '';
        document.getElementById('welcome-message').style.display = 'block';
        document.getElementById('welcome-message').innerHTML = `<p>本章没有错题记录，继续保持！</p>`;
    }
}

export function showAllWrongAnswers() {
    window.scrollTo(0, 0);
    state.activeChapter = null;
    state.activeType = null;
    
    document.getElementById('welcome-message').style.display = 'none';
    updateGlobalControls(true, { showAllWrongClear: true, showAllWrongTest: true });
    document.getElementById('main-title').textContent = '全局错题汇总';

    if (state.activeChapterButton) {
        state.activeChapterButton.classList.remove('active');
        state.activeChapterButton = null;
    }

    const allWrongQids = getWrongAnswerQids();
    const questionsList = allWrongQids.map(qid => state.question_lookup[qid]).filter(Boolean);
    const visibleBlocks = renderQuestions(questionsList, { mode: 'wrong' });
    
    visibleBlocks.forEach(block => {
        const removeBtn = block.querySelector('.remove-wrong-answer-btn');
        if (removeBtn) removeBtn.style.display = 'inline-block';
    });
    if (questionsList.length === 0) {
        updateGlobalControls(false);
        document.getElementById('content-area').innerHTML = '';
        document.getElementById('welcome-message').style.display = 'block';
        document.getElementById('welcome-message').innerHTML = `<p>太棒了！您当前没有任何错题记录。</p>`;
    }
}

export function showAllFavorites() {
    window.scrollTo(0, 0);
    state.activeChapter = null;
    state.activeType = null;
    
    document.getElementById('welcome-message').style.display = 'none';
    updateGlobalControls(true);
    document.getElementById('main-title').textContent = '我的收藏';

    if (state.activeChapterButton) {
        state.activeChapterButton.classList.remove('active');
        state.activeChapterButton = null;
    }

    const favQuestions = state.favorites.map(qid => state.question_lookup[qid]).filter(Boolean);
    const visibleBlocks = renderQuestions(favQuestions);
    
    visibleBlocks.forEach(block => {
        const removeBtn = block.querySelector('.remove-wrong-answer-btn');
        if (removeBtn) removeBtn.style.display = 'none';
    });
    if (favQuestions.length === 0) {
        updateGlobalControls(false);
        document.getElementById('content-area').innerHTML = '';
        document.getElementById('welcome-message').style.display = 'block';
        document.getElementById('welcome-message').innerHTML = '<p>你还没有收藏任何题目。</p>';
    }
}

export function filterQuestions(query) {
    const searchTerm = query.trim().toLowerCase();
    const terms = getSearchTerms(searchTerm);
    const typeFilter = document.getElementById('search-type-filter')?.value || 'all';
    const scopeFilter = document.getElementById('search-scope-filter')?.value || 'all';
    const chapterInputs = Array.from(document.querySelectorAll('input[name="search-chapter"]'));
    const selectedChapters = chapterInputs.filter(input => input.checked).map(input => input.value);
    const chapterFilterActive = chapterInputs.length > 0 && selectedChapters.length !== chapterInputs.length;
    const selectedChapterSet = new Set(selectedChapters);
    const hasActiveSearch = searchTerm.length > 0
        || typeFilter !== 'all'
        || scopeFilter !== 'all'
        || chapterFilterActive;
    
    if (state.activeChapterButton) {
        state.activeChapterButton.classList.remove('active');
        state.activeChapterButton = null;
    }
    
    if (!hasActiveSearch) {
        showHome();
        return;
    }

    document.getElementById('welcome-message').style.display = 'none';
    updateGlobalControls(true, { showFavoriteFilter: true });
    document.getElementById('main-title').textContent = searchTerm.length > 0 ? `搜索结果: "${query}"` : '筛选结果';
    
    const allQuestions = [...window.mcq_data, ...window.tf_data];
    const filtered = allQuestions.filter(q => {
        if (typeFilter !== 'all' && q.type !== typeFilter) return false;
        if (scopeFilter === 'favorites' && !state.favorites.includes(q.qid)) return false;
        if (scopeFilter === 'wrong' && !getWrongAnswerQids(q.chapter).includes(q.qid)) return false;
        if (chapterFilterActive && !selectedChapterSet.has(q.chapter)) return false;

        const itemText = (q.question + (q.options ? q.options.join(' ') : '') + q.answer + (q.explanation || '')).toLowerCase();
        return terms.every(term => itemText.includes(term));
    });

    const visibleBlocks = renderQuestions(filtered, {
        searchTerms: terms,
        mode: scopeFilter === 'wrong' ? 'wrong' : 'search'
    });
    visibleBlocks.forEach(block => {
        const removeBtn = block.querySelector('.remove-wrong-answer-btn');
        if (removeBtn) removeBtn.style.display = scopeFilter === 'wrong' ? 'inline-block' : 'none';
    });

    if (filtered.length === 0) {
        updateGlobalControls(false);
        document.getElementById('content-area').innerHTML = '';
        document.getElementById('welcome-message').style.display = 'block';
        document.getElementById('welcome-message').innerHTML = searchTerm.length > 0
            ? `<p>未找到包含 "${query}" 的题目。</p>`
            : '<p>未找到符合当前筛选条件的题目。</p>';
    }
}

export function openSearchModal() {
    const modal = document.getElementById('search-modal');
    const input = document.getElementById('global-search');
    if (!modal) return;
    modal.style.display = 'flex';
    setTimeout(() => input?.focus(), 0);
}

export function closeSearchModal() {
    const modal = document.getElementById('search-modal');
    if (modal) modal.style.display = 'none';
}

export function showDashboard() {
    document.getElementById('dashboard-modal').style.display = 'block';
    document.getElementById('stat-total').textContent = state.userStats.total;
    const rate = state.userStats.total === 0 ? 0 : Math.round((state.userStats.correct / state.userStats.total) * 100);
    document.getElementById('stat-correct').textContent = `${rate}%`;
    document.getElementById('stat-correct').style.color = rate >= 60 ? 'var(--success)' : 'var(--error)';
    
    const totalWrong = getWrongAnswerQids().length;
    document.getElementById('stat-wrong-count').textContent = totalWrong;

    const tbody = document.getElementById('stats-table-body');
    tbody.innerHTML = '';
    const dashboardContent = document.querySelector('#dashboard-modal .modal-content');
    let insightBox = document.getElementById('dashboard-insights');
    if (!insightBox) {
        insightBox = document.createElement('div');
        insightBox.id = 'dashboard-insights';
        dashboardContent.insertBefore(insightBox, tbody.closest('div'));
    }
    
    const chapterRows = Object.keys(state.all_data).sort((a, b) => getChapterOrder(a) - getChapterOrder(b)).map(chapter => {
        const stats = state.userStats.chapterStats[chapter] || { total: 0, correct: 0 };
        const acc = stats.total === 0 ? 0 : Math.round((stats.correct / stats.total) * 100);
        const totalQuestions = state.all_data[chapter].mcq.length + state.all_data[chapter].tf.length;
        const practiced = Math.min(stats.total, totalQuestions);
        const completion = totalQuestions === 0 ? 0 : Math.round((practiced / totalQuestions) * 100);
        const wrongCount = getWrongAnswerQids(chapter).length;
        return { chapter, stats, acc, totalQuestions, practiced, completion, wrongCount };
    });

    const weakChapters = chapterRows
        .filter(row => row.stats.total > 0)
        .sort((a, b) => (a.acc - b.acc) || (b.wrongCount - a.wrongCount))
        .slice(0, 3);

    insightBox.innerHTML = weakChapters.length ? `
        <div class="dashboard-insight-card">
            <strong>优先复习</strong>
            <span>${weakChapters.map(row => `${row.chapter} (${row.acc}%)`).join('、')}</span>
        </div>
    ` : `
        <div class="dashboard-insight-card">
            <strong>优先复习</strong>
            <span>先完成一次章节或综合测试，系统会自动识别薄弱章节。</span>
        </div>
    `;

    chapterRows.forEach(row => {
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.chapter}<br><span style="font-size:0.8em;color:var(--text-light);">完成 ${row.practiced}/${row.totalQuestions}，错题 ${row.wrongCount}</span></td>
            <td>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${row.completion}%"></div>
                </div>
            </td>
            <td style="text-align:right;">${row.acc}% <span style="font-size:0.8em;color:var(--text-light);">(${row.stats.correct}/${row.stats.total})</span></td>
        `;
        tbody.appendChild(tr);
    });
}
export function closeDashboard() {
    document.getElementById('dashboard-modal').style.display = 'none';
}
export function showDataSync() {
    document.getElementById('data-modal').style.display = 'block';
    document.getElementById('data-area').value = '';
}
export function closeDataSync() {
    document.getElementById('data-modal').style.display = 'none';
}
export function downloadNotepadTxt() {
    const content = document.getElementById('notepad').value;
    if (!content) { alert('笔记为空，无法导出！'); return; }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `机设自测笔记_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function initWallpaper() {
    const savedWallpaper = localStorage.getItem(WALLPAPER_KEY);
    if (savedWallpaper) {
        applyWallpaper(savedWallpaper);
    }
}
export function applyWallpaper(url) {
    document.body.style.backgroundImage = `url('${url}')`;
    document.body.classList.add('has-wallpaper');
}
export function removeWallpaper() {
    localStorage.removeItem(WALLPAPER_KEY);
    document.body.style.backgroundImage = '';
    document.body.classList.remove('has-wallpaper');
    alert('壁纸已清除。');
}

export function handleWallpaperUpload(input) {
    const file = input.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert('图片太大了！请上传 5MB 以内的图片。');
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const image = document.getElementById('cropper-image');
        
        if (state.cropper) {
            state.cropper.destroy();
            state.cropper = null;
        }

        image.src = e.target.result;
        document.getElementById('cropper-modal').style.display = 'block';
        
        image.onload = function() {
            state.cropper = new Cropper(image, {
                aspectRatio: NaN, 
                viewMode: 1, 
                autoCropArea: 0.9,
                responsive: true,
                restore: false,
                checkCrossOrigin: false,
            });
        };
    };
    reader.readAsDataURL(file);
    input.value = '';
}
export function confirmCrop() {
    if (!state.cropper) return;
    const canvas = state.cropper.getCroppedCanvas({
        maxWidth: 1920,
        maxHeight: 1080
    });
    if (!canvas) return;

    try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        localStorage.setItem(WALLPAPER_KEY, dataUrl);
        applyWallpaper(dataUrl);
        closeCropper();
        alert('壁纸设置成功。');
    } catch (error) {
         alert('设置失败：裁剪后的图片可能还是太大。请尝试裁剪更小的区域。');
         console.error(error);
    }
}
export function closeCropper() {
    document.getElementById('cropper-modal').style.display = 'none';
    if (state.cropper) {
        state.cropper.destroy();
        state.cropper = null;
    }
}

export function triggerWallpaperUpload() {
    if (document.body.classList.contains('has-wallpaper')) {
        if (confirm('是否要清除当前壁纸？\\n点击[确定]清除，点击[取消]更换新壁纸。')) {
            removeWallpaper();
            return; 
        }
    }
    document.getElementById('wallpaper-upload').click();
}

export function toggleRightSidebar() {
    document.body.classList.toggle('right-sidebar-open');
    if (document.body.classList.contains('sidebar-open')) {
        document.body.classList.remove('sidebar-open');
    }
}

export function clearAllWrongAnswers() {
    if (confirm(`确定要彻底清空所有章节的错题记录吗？`)) {
        state.wrongAnswersByChapter = {};
        saveWrongAnswers();
        showAllWrongAnswers();
        updateChapterNavStatus();
    }
}

export function clearCurrentChapterWrongAnswers() {
    if (!state.activeChapter) return;
    if (confirm(`确定要清空【${state.activeChapter}】的所有错题记录吗？`)) {
        state.wrongAnswersByChapter[state.activeChapter] = {};
        saveWrongAnswers();
        showChapterWrongAnswers(state.activeChapter);
        updateChapterNavStatus();
    }
}

export function removeSingleWrongAnswer(qid, chapter, btn) {
    if (confirm('确定将此题从错题本移除？')) {
        removeWrongAnswerRecord(chapter, qid);
        saveWrongAnswers();
        
        const block = btn.closest('.question-block');
        if (block) block.remove();
        removeQuestionFromIndex(qid);
        
        updateChapterNavStatus();

        if (state.activeChapter === null && document.getElementById('main-title').textContent === '全局错题汇总') {
            const allWrongQids = getWrongAnswerQids();
            if (allWrongQids.length === 0) {
                showAllWrongAnswers();
            }
        } else if (getWrongAnswerQids(chapter).length === 0) {
            showChapterWrongAnswers(chapter);
        }
    }
}

export function toggleFavorite(qid, btn) {
    const index = state.favorites.indexOf(qid);
    if (index > -1) {
        state.favorites.splice(index, 1);
        btn.classList.remove('favorited');
        btn.innerHTML = '<i data-lucide="star"></i> 收藏';
        
        if (state.activeChapter === null && state.activeType === null && document.getElementById('main-title').textContent === '我的收藏') {
            const block = btn.closest('.question-block');
            if (block) block.remove();
            removeQuestionFromIndex(qid);
            if (state.favorites.length === 0) {
                 showAllFavorites();
            }
        } else if (document.getElementById('toggle-favorites-btn').dataset.state === 'favorites') {
            const block = btn.closest('.question-block');
            if (block) block.style.display = 'none';
            syncQuestionIndexVisibility();
        }
    } else {
        state.favorites.push(qid);
        btn.classList.add('favorited');
        btn.innerHTML = '<i data-lucide="star"></i> 已收藏';
    }
    saveFavorites();
    syncQuestionIndexMarkers();
}

export function toggleAllAnswers() {
    const btn = document.getElementById('toggle-all-answers-btn');
    const showing = btn.dataset.state === 'shown';
    
    document.querySelectorAll('.question-block.visible').forEach(block => {
        const answerSpan = block.querySelector('.answer-span');
        const explanationSpan = block.querySelector('.explanation-span');
        if (showing) {
            answerSpan.style.display = 'none';
            if (explanationSpan) explanationSpan.style.display = 'none';
        } else {
            answerSpan.style.display = 'inline';
            if (explanationSpan) {
                explanationSpan.style.display = 'block';
                typesetMath([explanationSpan]);
            }
        }
    });

    btn.textContent = showing ? '显示全部答案' : '隐藏全部答案';
    btn.dataset.state = showing ? 'hidden' : 'shown';
}

export function toggleFavoritesView() {
    const btn = document.getElementById('toggle-favorites-btn');
    const showingOnlyFavorites = btn.dataset.state === 'favorites';
    
    document.querySelectorAll('.question-block.visible').forEach(block => {
        const qid = block.dataset.qid;
        if (showingOnlyFavorites) {
            block.style.display = 'block';
        } else {
            if (state.favorites.includes(qid)) {
                block.style.display = 'block';
            } else {
                block.style.display = 'none';
            }
        }
    });

    btn.textContent = showingOnlyFavorites ? '只显示收藏' : '显示全部题目';
    btn.dataset.state = showingOnlyFavorites ? 'all' : 'favorites';
    syncQuestionIndexVisibility();
}
