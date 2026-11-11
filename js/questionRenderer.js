import { state } from './state.js';
import {
    escapeAttr,
    escapeHtml,
    formatInlineHtml,
    parseMcqOption,
    renderMarkdown,
    stripQuestionNumber,
    typesetMath,
    typesetMathBatched
} from './utils.js';
import { renderIcons } from './icons.js';
import {
    getWrongAnswerQids,
    recordCorrectPractice,
    recordWrongAnswer,
    updateStats
} from './storage.js';
import { hasQuestionAddition, hasQuestionEdit } from './questionEdits.js';

let questionIndexView = 'list';
let questionIndexObserver = null;
let questionIndexScrollEndHandler = null;
let activeIndexButton = null;

function getWrongStatusLabel(status) {
    const labels = {
        unmastered: '未掌握',
        reviewing: '巩固中',
        mastered: '已掌握'
    };
    return labels[status] || '未掌握';
}

export function stopQuestionIndexTracking() {
    if (questionIndexObserver) {
        questionIndexObserver.disconnect();
        questionIndexObserver = null;
    }
    if (questionIndexScrollEndHandler) {
        window.removeEventListener('scroll', questionIndexScrollEndHandler);
        questionIndexScrollEndHandler = null;
    }
    activeIndexButton = null;
}

function setActiveQuestionIndex(qid) {
    if (!qid) return;
    if (activeIndexButton && activeIndexButton.dataset.qid === qid) return;

    if (activeIndexButton) {
        activeIndexButton.classList.remove('active');
        activeIndexButton.removeAttribute('aria-current');
    }

    const nextButton = Array.from(document.querySelectorAll('.question-index-item'))
        .find(button => button.dataset.qid === qid && !button.hidden);
    if (nextButton) {
        nextButton.classList.add('active');
        nextButton.setAttribute('aria-current', 'location');
        activeIndexButton = nextButton;
    } else {
        activeIndexButton = null;
    }
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
    const visible = blocks.filter(block => !block.hidden && block.style.display !== 'none');
    if (!visible.length) return;

    const visibleSet = new Map(visible.map(block => [block, block.dataset.qid]));

    if (typeof IntersectionObserver === 'function') {
        const intersecting = new Set();
        questionIndexObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    intersecting.add(entry.target);
                } else {
                    intersecting.delete(entry.target);
                }
            });

            if (intersecting.size > 0) {
                const firstVisible = visible.find(block => intersecting.has(block));
                if (firstVisible) {
                    setActiveQuestionIndex(visibleSet.get(firstVisible));
                }
            }
        }, {
            rootMargin: '-12% 0px -68% 0px',
            threshold: 0
        });

        visible.forEach(block => questionIndexObserver.observe(block));
    }

    let scrollEndFrame = null;
    questionIndexScrollEndHandler = () => {
        if (scrollEndFrame !== null) return;
        scrollEndFrame = requestAnimationFrame(() => {
            scrollEndFrame = null;
            if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) {
                const lastBlock = visible[visible.length - 1];
                if (lastBlock) setActiveQuestionIndex(lastBlock.dataset.qid);
            }
        });
    };
    window.addEventListener('scroll', questionIndexScrollEndHandler, { passive: true });
    setActiveQuestionIndex(visible[0].dataset.qid);
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

export function syncQuestionIndexMarkers() {
    const favoriteQids = new Set(state.favorites);
    const wrongQids = new Set(getWrongAnswerQids());
    document.querySelectorAll('.question-index-item').forEach(button => {
        const isFavorite = favoriteQids.has(button.dataset.qid);
        const isWrong = wrongQids.has(button.dataset.qid);
        const status = button.querySelector('.question-index-status');
        if (!status) return;
        status.innerHTML = `${isFavorite ? '<i data-lucide="star" class="question-index-favorite"></i>' : ''}${isWrong ? '<i data-lucide="circle-alert" class="question-index-wrong"></i>' : ''}`;
        renderIcons(status);
        const labels = [isFavorite && '已收藏', isWrong && '错题'].filter(Boolean);
        button.setAttribute('aria-label', `第 ${button.dataset.number} 题：${button.title}${labels.length ? `（${labels.join('、')}）` : ''}`);
    });
}

export function syncQuestionIndexVisibility() {
    const blocks = Array.from(document.querySelectorAll('.question-list .question-block'));
    const blocksById = new Map(blocks.map(block => [block.dataset.qid, block]));
    document.querySelectorAll('.question-index-item').forEach(button => {
        const block = blocksById.get(button.dataset.qid);
        button.hidden = !block || block.style.display === 'none';
    });
    updateQuestionIndexCount();
    trackQuestionBlocks(blocks);
    const active = document.querySelector('.question-index-item.active:not([hidden])');
    if (!active) {
        const first = document.querySelector('.question-index-item:not([hidden])');
        if (first) setActiveQuestionIndex(first.dataset.qid);
    }
}

export function removeQuestionFromIndex(qid) {
    const button = Array.from(document.querySelectorAll('.question-index-item')).find(item => item.dataset.qid === qid);
    button?.remove();
    state.currentQuestionList = state.currentQuestionList.filter(item => item.qid !== qid);
    document.querySelectorAll('.question-index-item').forEach((item, index) => {
        const number = index + 1;
        item.dataset.number = String(number);
        const numEl = item.querySelector('.question-index-number');
        if (numEl) numEl.textContent = String(number).padStart(2, '0');
    });
    syncQuestionIndexMarkers();
    syncQuestionIndexVisibility();
}

export function jumpToQuestion(qid) {
    const block = Array.from(document.querySelectorAll('.question-list .question-block'))
        .find(item => item.dataset.qid === qid && item.style.display !== 'none');
    if (!block) return;
    setActiveQuestionIndex(qid);
    if (window.innerWidth <= 1200) {
        const panel = document.querySelector('.question-index');
        const toggleBtn = panel?.querySelector('.question-index-collapse-btn');
        if (panel?.classList.contains('is-expanded')) {
            panel.classList.remove('is-expanded');
            if (toggleBtn) {
                toggleBtn.setAttribute('aria-expanded', 'false');
                const labelEl = toggleBtn.querySelector('span');
                if (labelEl) labelEl.textContent = '展开索引';
            }
        }
    }
    block.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function toggleQuestionIndexCollapse(btn) {
    const panel = btn?.closest('.question-index') || document.querySelector('.question-index');
    if (!panel) return;
    const expanded = panel.classList.toggle('is-expanded');
    const toggleBtn = btn || panel.querySelector('.question-index-collapse-btn');
    if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', String(expanded));
        const labelEl = toggleBtn.querySelector('span');
        if (labelEl) labelEl.textContent = expanded ? '收起索引' : '展开索引';
    }
}

/**
 * 统一控制题卡答案与解析的显隐状态
 */
export function setQuestionAnswerVisibility(block, show, options = {}) {
    if (!block) return;
    const answerSpan = block.querySelector('.answer-span');
    const explanationSpan = block.querySelector('.explanation-span');
    const toggleBtn = block.querySelector('[data-action="toggleAnswer"]');

    if (answerSpan) {
        answerSpan.style.display = show ? 'inline-flex' : 'none';
    }
    if (explanationSpan) {
        const hasBody = Boolean(explanationSpan.textContent.trim());
        explanationSpan.style.display = show && hasBody ? 'block' : 'none';
        if (show && hasBody && !options.skipTypeset) {
            typesetMath([explanationSpan]);
        }
    }
    if (toggleBtn) {
        toggleBtn.dataset.state = show ? 'shown' : 'hidden';
        toggleBtn.innerHTML = show
            ? '<i data-lucide="eye-off"></i> 隐藏答案'
            : '<i data-lucide="eye"></i> 显示答案';
        renderIcons(toggleBtn);
    }
    if (!show) {
        delete block.dataset.practiced;
        block.querySelectorAll('.practice-option-btn').forEach(btn => {
            btn.classList.remove('is-selected', 'is-correct', 'is-wrong');
            btn.setAttribute('aria-pressed', 'false');
        });
    }
}

export function toggleSingleAnswer(actionBtn) {
    const block = actionBtn?.closest('.question-block');
    if (!block) return;
    const isShowing = actionBtn.dataset.state === 'shown';
    setQuestionAnswerVisibility(block, !isShowing);
}

export function selectPracticeOption(optionBtn, onProgressChange = null) {
    const block = optionBtn?.closest('.question-block');
    if (!block) return;
    const qid = block.dataset.qid;
    const item = state.question_lookup[qid];
    if (!item) return;

    const selected = String(optionBtn.dataset.opt || '').trim().toUpperCase();
    const correct = String(item.answer || '').trim().toUpperCase();
    const allOptions = block.querySelectorAll('.practice-option-btn[data-opt]');
    allOptions.forEach(btn => {
        btn.classList.remove('is-selected', 'is-correct', 'is-wrong');
        btn.setAttribute('aria-pressed', 'false');
        if (String(btn.dataset.opt || '').trim().toUpperCase() === correct) {
            btn.classList.add('is-correct');
        }
    });

    optionBtn.classList.add('is-selected');
    optionBtn.setAttribute('aria-pressed', 'true');
    const isCorrect = selected === correct;
    if (!isCorrect) {
        optionBtn.classList.add('is-wrong');
    }

    // 练习卡首次选择时记录统计与错题（若用户开启了练习自动计入进度）
    if (state.practiceTrackProgress && block.dataset.practiced !== 'true') {
        block.dataset.practiced = 'true';
        updateStats(item, isCorrect);
        if (isCorrect) {
            recordCorrectPractice(item);
        } else {
            recordWrongAnswer(item, '章节练习');
        }
        if (typeof onProgressChange === 'function') {
            onProgressChange();
        }
    }

    setQuestionAnswerVisibility(block, true);
}

export function toggleAllAnswers() {
    const btn = document.getElementById('toggle-all-answers-btn');
    if (!btn) return;
    const showing = btn.dataset.state === 'shown';
    const nextShow = !showing;

    const blocksToTypeset = [];
    document.querySelectorAll('.question-block.visible').forEach(block => {
        setQuestionAnswerVisibility(block, nextShow, { skipTypeset: true });
        if (nextShow) {
            const explanationSpan = block.querySelector('.explanation-span');
            if (explanationSpan && explanationSpan.textContent.trim()) {
                blocksToTypeset.push(explanationSpan);
            }
        }
    });

    if (blocksToTypeset.length > 0) {
        typesetMathBatched(blocksToTypeset, 15);
    }

    btn.textContent = nextShow ? '隐藏全部答案' : '显示全部答案';
    btn.dataset.state = nextShow ? 'shown' : 'hidden';
}

export function toggleFavoritesView() {
    const btn = document.getElementById('toggle-favorites-btn');
    if (!btn) return;
    const showingOnlyFavorites = btn.dataset.state === 'favorites';
    const favoriteSet = new Set(state.favorites);

    document.querySelectorAll('.question-block.visible').forEach(block => {
        const qid = block.dataset.qid;
        block.style.display = (showingOnlyFavorites || favoriteSet.has(qid)) ? 'block' : 'none';
    });

    btn.textContent = showingOnlyFavorites ? '只显示收藏' : '显示全部题目';
    btn.dataset.state = showingOnlyFavorites ? 'all' : 'favorites';
    syncQuestionIndexVisibility();
}

function hasCompactOptions(item) {
    if (item.type !== 'mcq' || !Array.isArray(item.options) || item.options.length < 2 || item.options.length > 4) {
        return false;
    }
    return item.options.every(rawOpt => {
        const { text } = parseMcqOption(rawOpt);
        if (!text || text.includes('\n')) return false;
        const plainLen = text.replace(/\$/g, '').length;
        return plainLen <= 14;
    });
}

export function createQuestionBlock(item, options = {}) {
    const block = document.createElement('div');
    block.className = 'question-block visible';
    block.dataset.qid = item.qid;
    block.dataset.chapter = item.chapter;
    block.dataset.type = item.type;

    const hasLocalEdit = hasQuestionEdit(item.qid);
    const hasLocalAddition = hasQuestionAddition(item.qid);
    if (hasLocalEdit) block.classList.add('has-local-edit');
    if (hasLocalAddition) block.classList.add('has-local-addition');

    const explanationHtml = renderMarkdown(item.explanation);
    const isFav = state.favorites.includes(item.qid);
    const wrongRecord = (state.wrongAnswersByChapter[item.chapter] || {})[item.qid];
    const searchTerms = options.searchTerms || [];
    const questionHtml = formatInlineHtml(item.question, searchTerms);

    const wrongMetaHtml = wrongRecord ? `
        <div class="wrong-meta status-${escapeAttr(wrongRecord.status)}">
            <span>${escapeHtml(getWrongStatusLabel(wrongRecord.status))}</span>
            <span>错 ${Number(wrongRecord.wrongCount) || 1} 次</span>
            <span>连续答对 ${Number(wrongRecord.correctStreak) || 0} 次</span>
        </div>
    ` : '';

    const editBadgeHtml = hasLocalAddition
        ? '<span class="local-add-badge"><i data-lucide="plus"></i> 本地新增</span>'
        : (hasLocalEdit ? '<span class="local-edit-badge"><i data-lucide="pen"></i> 本地修订</span>' : '');
    const editAction = hasLocalAddition ? 'openQuestionEntryEditor' : 'openQuestionEditor';
    const editLabel = hasLocalAddition ? '编辑录入' : '编辑';
    const typeLabel = item.type === 'mcq' ? '单选题' : '判断题';
    const showChapterBadge = !state.activeChapter && item.chapter;
    const chapterBadgeHtml = showChapterBadge
        ? `<span class="question-chapter-badge">${escapeHtml(item.chapter)}</span>`
        : '';

    const optionsListClass = hasCompactOptions(item)
        ? 'question-options-list compact-options-grid'
        : 'question-options-list';

    const optionsHtml = item.type === 'mcq' ? `
        <ul class="${optionsListClass}">
            ${(item.options || []).map(rawOpt => {
                const { key, text } = parseMcqOption(rawOpt);
                const formattedBody = formatInlineHtml(text, searchTerms);
                return `
                    <li>
                        <button type="button" class="practice-option-btn" data-action="selectPracticeOption" data-opt="${escapeAttr(key)}" aria-pressed="false">
                            ${key ? `<span class="opt-key">${escapeHtml(key)}</span>` : ''}
                            <span class="opt-val">${formattedBody}</span>
                        </button>
                    </li>
                `;
            }).join('')}
        </ul>
    ` : `
        <ul class="question-options-list tf-options-list">
            <li>
                <button type="button" class="practice-option-btn" data-action="selectPracticeOption" data-opt="✓" aria-pressed="false">
                    <span class="opt-key">✓</span>
                    <span class="opt-val">正确</span>
                </button>
            </li>
            <li>
                <button type="button" class="practice-option-btn" data-action="selectPracticeOption" data-opt="×" aria-pressed="false">
                    <span class="opt-key">×</span>
                    <span class="opt-val">错误</span>
                </button>
            </li>
        </ul>
    `;

    const showRemoveBtn = options.mode === 'wrong';

    block.innerHTML = `
        <div class="question-header-meta">
            <div class="question-badges">
                <span class="question-type-badge">${typeLabel}</span>
                ${chapterBadgeHtml}
                ${editBadgeHtml}
            </div>
            ${wrongMetaHtml}
        </div>
        <p class="question-stem">${questionHtml}</p>
        ${optionsHtml}
        <div class="action-buttons-container">
            <button type="button" class="action-button" data-action="toggleAnswer" data-state="hidden"><i data-lucide="eye"></i> 显示答案</button>
            <span class="answer-span"><strong class="answer-badge">答案</strong> ${escapeHtml(item.answer)}</span>
            <button type="button" class="action-button favorite-button ${isFav ? 'favorited' : ''}" data-qid="${escapeAttr(item.qid)}" data-action="toggleFavorite">${isFav ? '<i data-lucide="star"></i> 已收藏' : '<i data-lucide="star"></i> 收藏'}</button>
            <button type="button" class="action-button edit-question-button action-button--ghost" data-qid="${escapeAttr(item.qid)}" data-action="${editAction}"><i data-lucide="square-pen"></i> ${editLabel}</button>
            <button type="button" class="action-button remove-wrong-answer-btn action-button--danger-ghost" data-qid="${escapeAttr(item.qid)}" data-chapter="${escapeAttr(item.chapter)}" data-action="removeWrongAnswer" style="display:${showRemoveBtn ? 'inline-flex' : 'none'};"><i data-lucide="trash-2"></i> 移除此题</button>
            <div class="explanation-span">${explanationHtml ? `<div class="explanation-title">题目解析</div><div class="explanation-body">${explanationHtml}</div>` : ''}</div>
        </div>
    `;

    return block;
}

export function renderQuestions(questionsList, options = {}) {
    const contentArea = document.getElementById('content-area');
    stopQuestionIndexTracking();
    if (!contentArea) return [];

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
            <div class="question-index-controls">
                <div class="question-index-modes" role="group" aria-label="索引视图">
                    <button type="button" data-action="setQuestionIndexView" data-view="list" aria-label="列表视图" title="列表视图"><i data-lucide="list"></i></button>
                    <button type="button" data-action="setQuestionIndexView" data-view="grid" aria-label="网格视图" title="网格视图"><i data-lucide="layout-grid"></i></button>
                </div>
                <button type="button" class="question-index-collapse-btn" data-action="toggleQuestionIndexCollapse" aria-expanded="false" aria-label="展开或收起题目索引">
                    <span>展开索引</span><i data-lucide="chevron-down"></i>
                </button>
            </div>
        </div>
        <nav class="question-index-items" aria-label="跳转到题目"></nav>
    `;

    const indexItems = indexPanel.querySelector('.question-index-items');
    const questionList = document.createElement('div');
    questionList.className = 'question-list';
    const visibleBlocks = [];
    const indexFragment = document.createDocumentFragment();
    const listFragment = document.createDocumentFragment();

    questionsList.forEach((item, index) => {
        const block = createQuestionBlock(item, options);
        block.id = `question-${index + 1}`;
        listFragment.appendChild(block);
        visibleBlocks.push(block);

        const rawTitle = stripQuestionNumber(item.question) || `第 ${index + 1} 题`;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'question-index-item';
        button.dataset.action = 'jumpToQuestion';
        button.dataset.qid = item.qid;
        button.dataset.number = String(index + 1);
        button.title = rawTitle;
        button.setAttribute('aria-label', `第 ${index + 1} 题：${rawTitle}`);

        const number = document.createElement('span');
        number.className = 'question-index-number';
        number.textContent = String(index + 1).padStart(2, '0');

        const label = document.createElement('span');
        label.className = 'question-index-label';
        // 使用带公式保护的 formatInlineHtml，防止索引项内出现 < 被吞或 XSS
        label.innerHTML = formatInlineHtml(rawTitle);

        const status = document.createElement('span');
        status.className = 'question-index-status';
        status.setAttribute('aria-hidden', 'true');

        button.append(number, label, status);
        indexFragment.appendChild(button);
    });

    indexItems.appendChild(indexFragment);
    questionList.appendChild(listFragment);
    workspace.append(indexPanel, questionList);
    contentArea.appendChild(workspace);

    renderIcons(workspace);
    syncQuestionIndexMarkers();
    setQuestionIndexView(questionIndexView);
    updateQuestionIndexCount();
    if (questionsList.length) setActiveQuestionIndex(questionsList[0].qid);
    trackQuestionBlocks(visibleBlocks);

    // 优先对左侧索引与首批题卡执行 MathJax 排版，剩余题目分帧渐进排版避免卡顿
    const stemsAndOptions = visibleBlocks.map(block => block.querySelector('.question-stem')).filter(Boolean);
    const optionLists = visibleBlocks.map(block => block.querySelector('.question-options-list')).filter(Boolean);
    const firstTargets = [indexItems];
    visibleBlocks.slice(0, 12).forEach(block => {
        const stem = block.querySelector('.question-stem');
        const opts = block.querySelector('.question-options-list');
        if (stem) firstTargets.push(stem);
        if (opts) firstTargets.push(opts);
    });
    typesetMath(firstTargets);
    if (visibleBlocks.length > 12) {
        const restTargets = [];
        for (let i = 12; i < visibleBlocks.length; i++) {
            if (stemsAndOptions[i]) restTargets.push(stemsAndOptions[i]);
            if (optionLists[i]) restTargets.push(optionLists[i]);
        }
        typesetMathBatched(restTargets, 16);
    }

    return visibleBlocks;
}
