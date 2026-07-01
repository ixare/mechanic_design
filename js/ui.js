import { state } from './state.js';
import { typesetMath } from './utils.js';
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
    discardQuestionEdit,
    downloadQuestionSyncPayload,
    getQuestionEditCount,
    getQuestionSyncPayload,
    hasQuestionEdit,
    openQuestionSyncIssue,
    saveQuestionEdit
} from './questionEdits.js';

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
        if (event.target.tagName === 'BUTTON' && window.innerWidth <= 992) {
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
    document.getElementById('search-modal')?.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        filterQuestions(searchInput.value);
        closeSearchModal();
    });
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
}

export function updateGlobalControls(show, options = {}) {
    document.getElementById('global-controls').style.display = show ? 'flex' : 'none';
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
        mcqBtn.innerHTML = '<i class="fa-solid fa-list-ul"></i> 选择题';
        mcqBtn.dataset.chapter = chapterName;
        mcqBtn.dataset.type = 'mcq';
        mcqBtn.dataset.action = 'showQuestions';
        buttonContainer.appendChild(mcqBtn);

        const tfBtn = document.createElement('button');
        tfBtn.className = 'chapter-type-button';
        tfBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> 判断题';
        tfBtn.dataset.chapter = chapterName;
        tfBtn.dataset.type = 'tf';
        tfBtn.dataset.action = 'showQuestions';
        buttonContainer.appendChild(tfBtn);

        const testBtn = document.createElement('button');
        testBtn.className = 'chapter-test-button';
        testBtn.innerHTML = '<i class="fa-solid fa-flask"></i> 本章测试';
        testBtn.dataset.chapter = chapterName;
        testBtn.dataset.action = 'startChapterTest';
        buttonContainer.appendChild(testBtn);

        details.appendChild(buttonContainer);
        chapterNavList.appendChild(details);
    });

    updateChapterNavStatus();
}

export function renderQuestions(questionsList, options = {}) {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = '';
    state.currentQuestionList = questionsList;
    state.currentRenderOptions = { ...options };
    state.currentPage = options.page || 1;

    const totalPages = Math.max(1, Math.ceil(questionsList.length / state.questionPageSize));
    if (state.currentPage > totalPages) state.currentPage = totalPages;

    const start = (state.currentPage - 1) * state.questionPageSize;
    const pageQuestions = questionsList.slice(start, start + state.questionPageSize);
    let visibleBlocks = [];
    renderPagination(contentArea, questionsList.length, totalPages, options);
    pageQuestions.forEach(item => {
        const block = createQuestionBlock(item, options);
        block.classList.add('visible');
        contentArea.appendChild(block);
        visibleBlocks.push(block);
    });
    return visibleBlocks;
}

function renderPagination(contentArea, total, totalPages, options) {
    const pagination = document.createElement('div');
    pagination.className = 'pagination-controls';
    pagination.innerHTML = `
        <button class="action-button pagination-button" data-action="changePage" data-page="${state.currentPage - 1}" ${state.currentPage === 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-left"></i> 上一页
        </button>
        <span class="pagination-status">第 ${state.currentPage} / ${totalPages} 页，共 ${total} 题</span>
        <button class="action-button pagination-button" data-action="changePage" data-page="${state.currentPage + 1}" ${state.currentPage === totalPages ? 'disabled' : ''}>
            下一页 <i class="fa-solid fa-chevron-right"></i>
        </button>
        <button class="action-button pagination-top-button" data-action="scrollToQuestionTop" title="回到题目顶部" aria-label="回到题目顶部">
            <i class="fa-solid fa-arrow-up"></i> 回顶
        </button>
    `;
    pagination.dataset.renderMode = options.mode || 'list';
    contentArea.appendChild(pagination);
}

export function scrollToQuestionTop() {
    const mainTitle = document.getElementById('main-title');
    const target = mainTitle || document.getElementById('content-area');
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function changePage(page) {
    const nextPage = Number(page);
    if (!Number.isFinite(nextPage) || nextPage < 1) return;
    const visibleBlocks = renderQuestions(state.currentQuestionList, { ...state.currentRenderOptions, page: nextPage });
    visibleBlocks.forEach(block => {
        const removeBtn = block.querySelector('.remove-wrong-answer-btn');
        if (removeBtn) removeBtn.style.display = state.currentRenderOptions.mode === 'wrong' ? 'inline-block' : 'none';
    });
    typesetMath(visibleBlocks);
    document.getElementById('content-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function createQuestionBlock(item, options = {}) {
    const block = document.createElement('div');
    block.className = 'question-block';
    block.dataset.qid = item.qid;
    block.dataset.chapter = item.chapter;
    block.dataset.type = item.type;
    if (hasQuestionEdit(item.qid)) {
        block.classList.add('has-local-edit');
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
    const editBadgeHtml = hasQuestionEdit(item.qid) ? '<span class="local-edit-badge"><i class="fa-solid fa-pen"></i> 本地修订</span>' : '';
    block.innerHTML = `
        <p>${questionHtml}</p>
        ${editBadgeHtml}
        ${wrongMetaHtml}
        ${item.type === 'mcq' ? `<ul>${item.options.map(o => `<li>${formatInlineHtml(o, searchTerms)}</li>`).join('')}</ul>` : ''}
        <div class="action-buttons-container">
            <button class="action-button" data-action="toggleAnswer" data-state="hidden"><i class="fa-regular fa-eye"></i> 显示答案</button>
            <span class="answer-span">答案: ${item.answer}</span>
            <div class="explanation-span">${explanationHtml ? `<b>解析：</b>${explanationHtml}` : ''}</div>
            <button class="action-button favorite-button ${isFav ? 'favorited' : ''}" data-qid="${item.qid}" data-action="toggleFavorite">${isFav ? '<i class="fa-solid fa-star"></i> 已收藏' : '<i class="fa-regular fa-star"></i> 收藏'}</button>
            <button class="action-button edit-question-button" data-qid="${item.qid}" data-action="openQuestionEditor"><i class="fa-solid fa-pen-to-square"></i> 编辑</button>
            <button class="action-button remove-wrong-answer-btn" data-qid="${item.qid}" data-chapter="${item.chapter}" data-action="removeWrongAnswer"><i class="fa-solid fa-trash-can"></i> 移除此题</button>
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
    typesetMath(visibleBlocks);
    updateQuestionEditSummary();
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
    button.innerHTML = `<i class="fa-solid fa-pen-ruler"></i> 题目修订${count ? ` (${count})` : ''}`;
}

export function renderQuestionEditManager() {
    const summary = document.getElementById('question-edit-summary');
    const list = document.getElementById('question-edit-list');
    if (!summary || !list) return;

    const payload = getQuestionSyncPayload();
    summary.innerHTML = payload.changeCount
        ? `<strong>${payload.changeCount}</strong> 道题存在本地修订，可申请同步到 <code>question.json</code>。`
        : '当前没有本地题目修订。';

    if (!payload.changeCount) {
        list.innerHTML = '<div class="empty-edit-state">在题卡上点击“编辑”，修改会先保存在本机。</div>';
        updateQuestionEditSummary();
        return;
    }

    list.innerHTML = payload.changes.map(change => {
        const title = formatInlineHtml(change.updated.question).replace(/<\/?p>/g, '');
        return `
            <div class="question-edit-item">
                <div class="question-edit-item-main">
                    <span>${change.chapter} · ${change.type === 'mcq' ? '选择题' : '判断题'}</span>
                    <strong>${title}</strong>
                    <small>答案：${formatInlineHtml(change.updated.answer)}</small>
                </div>
                <div class="question-edit-item-actions">
                    <button class="action-button" data-action="openQuestionEditor" data-qid="${change.qid}"><i class="fa-solid fa-pen"></i> 编辑</button>
                    <button class="action-button remove-wrong-answer-btn" data-action="discardQuestionEdit" data-qid="${change.qid}"><i class="fa-solid fa-rotate-left"></i> 还原</button>
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
        alert('当前没有需要同步的本地修订。');
        return;
    }
    downloadQuestionSyncPayload();
}

export async function openQuestionSyncRequestIssue() {
    if (getQuestionEditCount() === 0) {
        alert('当前没有需要同步的本地修订。');
        return;
    }
    await openQuestionSyncIssue();
}

export function showQuestions(chapter, type, btn) {
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
    typesetMath(visibleBlocks);
}

export function showChapterWrongAnswers(chapterName, btn) {
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
    typesetMath(visibleBlocks);

    if (questionsList.length === 0) {
        updateGlobalControls(false);
        document.getElementById('content-area').innerHTML = '';
        document.getElementById('welcome-message').style.display = 'block';
        document.getElementById('welcome-message').innerHTML = `<p>本章没有错题记录，继续保持！</p>`;
    }
}

export function showAllWrongAnswers() {
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
    typesetMath(visibleBlocks);

    if (questionsList.length === 0) {
        updateGlobalControls(false);
        document.getElementById('content-area').innerHTML = '';
        document.getElementById('welcome-message').style.display = 'block';
        document.getElementById('welcome-message').innerHTML = `<p>太棒了！您当前没有任何错题记录。</p>`;
    }
}

export function showAllFavorites() {
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
    typesetMath(visibleBlocks);

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
        document.getElementById('content-area').innerHTML = '';
        document.getElementById('welcome-message').style.display = 'block';
        document.getElementById('welcome-message').innerHTML = '<p>请从左侧选择一个章节和题型开始练习。</p><p>也可以使用左侧全局搜索筛选题目。</p>';
        updateGlobalControls(false);
        document.getElementById('main-title').textContent = '欢迎使用机械设计基础题库自测';
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
    } else {
         typesetMath(visibleBlocks);
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
        alert('壁纸设置成功！✨');
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
        btn.innerHTML = '<i class="fa-regular fa-star"></i> 收藏';
        
        if (state.activeChapter === null && state.activeType === null && document.getElementById('main-title').textContent === '我的收藏') {
            const block = btn.closest('.question-block');
            if (block) block.remove();
            if (state.favorites.length === 0) {
                 showAllFavorites();
            }
        }
    } else {
        state.favorites.push(qid);
        btn.classList.add('favorited');
        btn.innerHTML = '<i class="fa-solid fa-star"></i> 已收藏';
    }
    saveFavorites();
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
}
