import { state } from './state.js';
import {
    escapeAttr,
    escapeHtml,
    formatInlineHtml,
    getChapterOrder,
    parseMcqOption,
    renderMarkdown,
    showToast,
    typesetMath
} from './utils.js';
import { renderIcons } from './icons.js';
import { closeModal, confirmDialog, configureModal, isModalOpen, openModal, requestCloseModal } from './modal.js';
import { getWrongAnswerQids, recordCorrectPractice, recordWrongAnswer, updateStats } from './storage.js';
import { updateChapterNavStatus } from './ui.js';

const randomTestState = {
    mode: 'exam',
    source: 'all',
    selectedChapters: null,
    questionCount: 20,
    examPreset: 'standard',
    examDelivery: 'sheet'
};

let examDeadline = 0;
let examVisibilityHandler = null;
let quizDraftAnswers = [];
let quizFlaggedSet = new Set();

function clearExamTimer() {
    if (state.examTimerInterval) {
        clearInterval(state.examTimerInterval);
        state.examTimerInterval = null;
    }
    examDeadline = 0;
    if (examVisibilityHandler && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', examVisibilityHandler);
        examVisibilityHandler = null;
    }
}

function getAllChapters() {
    return Object.keys(state.all_data).sort((a, b) => getChapterOrder(a) - getChapterOrder(b));
}

function getSelectedChapters() {
    const available = new Set(getAllChapters());
    if (!Array.isArray(randomTestState.selectedChapters)) {
        return getAllChapters();
    }
    return randomTestState.selectedChapters.filter(chapter => available.has(chapter));
}

function matchesRandomSource(question, pendingWrongQids) {
    if (randomTestState.source === 'favorites') {
        return state.favorites.includes(question.qid);
    }
    if (randomTestState.source === 'wrong') {
        return pendingWrongQids.has(question.qid);
    }
    return true;
}

function buildQuestionPool(type = null) {
    const selectedChapters = new Set(getSelectedChapters());
    const pendingWrongQids = new Set(getWrongAnswerQids(null, { status: 'pending' }));
    const questions = [];

    selectedChapters.forEach(chapterName => {
        const chapter = state.all_data[chapterName];
        if (!chapter) return;
        const chapterQuestions = type
            ? chapter[type]
            : [...chapter.mcq, ...chapter.tf];
        questions.push(...chapterQuestions.filter(question => matchesRandomSource(question, pendingWrongQids)));
    });

    return questions;
}

function getChapterQuestionCount(chapterName) {
    const chapter = state.all_data[chapterName];
    if (!chapter) return 0;
    const chapterQuestions = randomTestState.mode === 'exam'
        ? [...chapter.mcq, ...chapter.tf]
        : chapter[randomTestState.mode];
    const pendingWrongQids = new Set(getWrongAnswerQids(null, { status: 'pending' }));
    return chapterQuestions.filter(question => matchesRandomSource(question, pendingWrongQids)).length;
}

/**
 * 无偏 Fisher-Yates 洗牌算法
 */
export function shuffleQuestions(questions) {
    const result = [...(questions || [])];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function getRandomSourceLabel() {
    const labels = {
        all: '全部题目',
        wrong: '待复习错题',
        favorites: '收藏'
    };
    return labels[randomTestState.source] || labels.all;
}

function ensureRandomTestModal() {
    let modal = document.getElementById('random-test-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'random-test-modal';
    modal.className = 'modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div class="modal-content random-test-panel">
            <button class="close-modal" type="button" id="close-random-test-modal" aria-label="关闭" title="关闭"><i data-lucide="x"></i></button>
            <h2 id="random-test-title"><i data-lucide="sliders-horizontal"></i> 随机测试设置</h2>
            <div class="random-test-section">
                <div class="random-test-section-title">抽题来源</div>
                <div class="random-source-options">
                    <label><input type="radio" name="random-test-source" value="all" checked> 全部题目</label>
                    <label><input type="radio" name="random-test-source" value="wrong"> 只抽待复习错题</label>
                    <label><input type="radio" name="random-test-source" value="favorites"> 只抽收藏</label>
                </div>
            </div>
            <div class="random-test-section" id="random-test-count-section">
                <div class="random-test-section-title" id="random-test-count-label">抽题数量</div>
                <div class="random-count-options" id="random-count-options"></div>
            </div>
            <div class="random-test-section" id="random-exam-delivery-section" style="display:none;">
                <div class="random-test-section-title">作答方式</div>
                <div class="random-count-options" id="random-delivery-options">
                    <label><input type="radio" name="random-exam-delivery" value="sheet" checked> <span>考场全卷 (答题卡 · 统一交卷批改)</span></label>
                    <label><input type="radio" name="random-exam-delivery" value="instant"> <span>逐题自测 (每题即时看解析)</span></label>
                </div>
            </div>
            <div class="random-test-section">
                <div class="random-test-toolbar">
                    <div class="random-test-section-title">选择章节</div>
                    <div>
                        <button type="button" class="text-button" id="random-test-select-all">全选</button>
                        <button type="button" class="text-button" id="random-test-clear-all">清空</button>
                    </div>
                </div>
                <div id="random-test-chapters" class="random-test-chapters"></div>
            </div>
            <div id="random-test-summary" class="random-test-summary"></div>
            <div class="random-test-actions">
                <button type="button" class="quiz-button" id="start-random-test-confirm"><i data-lucide="play"></i> 开始测试</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    renderIcons(modal);

    modal.addEventListener('change', event => {
        if (event.target.name === 'random-test-source') {
            randomTestState.source = event.target.value;
            renderRandomTestChapters();
            updateRandomTestSummary();
        }
        if (event.target.name === 'random-test-chapter') {
            randomTestState.selectedChapters = Array.from(modal.querySelectorAll('input[name="random-test-chapter"]:checked')).map(input => input.value);
            updateRandomTestSummary();
        }
        if (event.target.name === 'random-test-count') {
            randomTestState.questionCount = Number(event.target.value);
            updateRandomTestSummary();
        }
        if (event.target.name === 'random-exam-preset') {
            randomTestState.examPreset = event.target.value;
            updateRandomTestSummary();
        }
        if (event.target.name === 'random-exam-delivery') {
            randomTestState.examDelivery = event.target.value;
            updateRandomTestSummary();
        }
    });
    modal.querySelector('#close-random-test-modal')?.addEventListener('click', closeRandomTestSetup);
    modal.querySelector('#random-test-select-all')?.addEventListener('click', () => {
        randomTestState.selectedChapters = getAllChapters();
        renderRandomTestChapters();
        updateRandomTestSummary();
    });
    modal.querySelector('#random-test-clear-all')?.addEventListener('click', () => {
        randomTestState.selectedChapters = [];
        renderRandomTestChapters();
        updateRandomTestSummary();
    });
    modal.querySelector('#start-random-test-confirm')?.addEventListener('click', startConfiguredRandomTest);
    configureModal('random-test-modal', { closeOnBackdrop: true });

    return modal;
}

function renderRandomTestCountOptions() {
    const label = document.getElementById('random-test-count-label');
    const container = document.getElementById('random-count-options');
    if (!container || !label) return;

    if (randomTestState.mode === 'exam') {
        label.textContent = '考卷规格';
        const presets = [
            { value: 'standard', text: '标准模拟 (30单选+20判断 · 20分钟)' },
            { value: 'quick', text: '快速测验 (15单选+10判断 · 10分钟)' },
            { value: 'full', text: '所选全部 (不限时)' }
        ];
        container.innerHTML = presets.map(preset => `
            <label>
                <input type="radio" name="random-exam-preset" value="${preset.value}" ${randomTestState.examPreset === preset.value ? 'checked' : ''}>
                <span>${preset.text}</span>
            </label>
        `).join('');
        return;
    }

    label.textContent = '抽题数量';
    const counts = [
        { value: 10, text: '10 题' },
        { value: 20, text: '20 题' },
        { value: 30, text: '30 题' },
        { value: 50, text: '50 题' },
        { value: 0, text: '全部' }
    ];
    container.innerHTML = counts.map(item => `
        <label>
            <input type="radio" name="random-test-count" value="${item.value}" ${randomTestState.questionCount === item.value ? 'checked' : ''}>
            <span>${item.text}</span>
        </label>
    `).join('');
}

function renderRandomTestChapters() {
    const container = document.getElementById('random-test-chapters');
    if (!container) return;
    const selected = new Set(getSelectedChapters());
    container.innerHTML = getAllChapters().map(chapter => {
        const count = getChapterQuestionCount(chapter);
        return `
            <label class="random-test-chapter-option">
                <input type="checkbox" name="random-test-chapter" value="${escapeAttr(chapter)}" ${selected.has(chapter) ? 'checked' : ''}>
                <span>${escapeHtml(chapter)}</span>
                <small>${count} 题</small>
            </label>
        `;
    }).join('');
}

function updateRandomTestSummary() {
    const summary = document.getElementById('random-test-summary');
    if (!summary) return;
    const selectedCount = getSelectedChapters().length;
    const sourceLabel = getRandomSourceLabel();
    const mcqCount = buildQuestionPool('mcq').length;
    const tfCount = buildQuestionPool('tf').length;
    const total = randomTestState.mode === 'exam' ? mcqCount + tfCount : buildQuestionPool(randomTestState.mode).length;

    let modeLabel;
    if (randomTestState.mode === 'exam') {
        const deliveryLabel = randomTestState.examDelivery === 'sheet' ? '考场全卷' : '逐题自测';
        modeLabel = `模拟考试 (${deliveryLabel})：池内共 ${mcqCount} 道单选、${tfCount} 道判断`;
    } else {
        const limitLabel = randomTestState.questionCount > 0
            ? `抽取最多 ${Math.min(randomTestState.questionCount, total)} 道（池内共 ${total} 道）`
            : `全部 ${total} 道`;
        modeLabel = `${randomTestState.mode === 'mcq' ? '选择题' : '判断题'}随机测试：${limitLabel}`;
    }
    const masteredNote = randomTestState.source === 'wrong' && total === 0 && getWrongAnswerQids().length > 0
        ? '（当前历史错题均已掌握）'
        : '';
    summary.textContent = `已选 ${selectedCount} 个章节，来源：${sourceLabel}，${modeLabel}${masteredNote}`;
}

export function openRandomTestSetup(mode) {
    const modal = ensureRandomTestModal();
    randomTestState.mode = mode;
    if (!Array.isArray(randomTestState.selectedChapters)) {
        randomTestState.selectedChapters = getAllChapters();
    }

    const titleMap = {
        exam: '模拟考试设置',
        mcq: '选择题随机测试设置',
        tf: '判断题随机测试设置'
    };
    const titleEl = document.getElementById('random-test-title');
    if (titleEl) {
        titleEl.innerHTML = `<i data-lucide="sliders-horizontal"></i> ${titleMap[mode] || '随机测试设置'}`;
        renderIcons(titleEl);
    }

    const sourceInput = modal.querySelector(`input[name="random-test-source"][value="${randomTestState.source}"]`);
    if (sourceInput) sourceInput.checked = true;

    const deliverySection = document.getElementById('random-exam-delivery-section');
    if (deliverySection) {
        deliverySection.style.display = mode === 'exam' ? 'block' : 'none';
    }
    const deliveryInput = modal.querySelector(`input[name="random-exam-delivery"][value="${randomTestState.examDelivery}"]`);
    if (deliveryInput) deliveryInput.checked = true;

    renderRandomTestCountOptions();
    renderRandomTestChapters();
    updateRandomTestSummary();
    openModal('random-test-modal');
}

function closeRandomTestSetup() {
    closeModal('random-test-modal');
}

function startConfiguredRandomTest() {
    if (getSelectedChapters().length === 0) {
        showToast('请至少选择一个章节。', 'warning');
        return;
    }
    closeRandomTestSetup();
    if (randomTestState.mode === 'exam') {
        startMockExam({
            mcqPool: buildQuestionPool('mcq'),
            tfPool: buildQuestionPool('tf'),
            preset: randomTestState.examPreset,
            delivery: randomTestState.examDelivery,
            titleSuffix: `｜${getRandomSourceLabel()}｜${getSelectedChapters().length}章`
        });
        return;
    }
    startOverallTest(randomTestState.mode, {
        questionPool: buildQuestionPool(randomTestState.mode),
        numQuestions: randomTestState.questionCount,
        titleSuffix: `｜${getRandomSourceLabel()}｜${getSelectedChapters().length}章`
    });
}

export function startChapterTest(chapterName) {
    const chapterData = state.all_data[chapterName];
    if (!chapterData || (chapterData.mcq.length === 0 && chapterData.tf.length === 0)) {
        showToast('该章节没有题目可供测试。', 'warning');
        return;
    }
    startQuiz([...chapterData.mcq, ...chapterData.tf], 0, `${chapterName} - 随机测试`);
}

export function startOverallTest(type, options = {}) {
    const questionPool = options.questionPool || (type === 'mcq' ? (globalThis.mcq_data || []) : (globalThis.tf_data || []));
    const title = type === 'mcq' ? '选择题随机测试' : '判断题随机测试';
    const numQuestions = typeof options.numQuestions === 'number' ? options.numQuestions : 20;
    startQuiz(questionPool, numQuestions, `${title}${options.titleSuffix || ''}`);
}

export function startAllWrongAnswersTest() {
    const statusFilter = state.wrongStatusFilter || 'pending';
    const allWrongQids = getWrongAnswerQids(null, { status: statusFilter });
    if (allWrongQids.length === 0) {
        const hasMastered = statusFilter === 'pending' && getWrongAnswerQids().length > 0;
        showToast(
            hasMastered ? '待复习错题已全部掌握；如需重练已掌握题目，请先切换“显示全部错题”。' : '您的错题本是空的，无法开始测试。',
            'info'
        );
        return;
    }
    const questionPool = allWrongQids.map(qid => state.question_lookup[qid]).filter(Boolean);
    const title = statusFilter === 'pending' ? '待复习错题随机测试' : '所有错题随机测试';
    startQuiz(questionPool, 0, title);
}

export function startCurrentChapterWrongAnswersTest() {
    if (!state.activeChapter) return;
    const statusFilter = state.wrongStatusFilter || 'pending';
    const chapterWrongQids = getWrongAnswerQids(state.activeChapter, { status: statusFilter });
    if (chapterWrongQids.length === 0) {
        const hasMastered = statusFilter === 'pending' && getWrongAnswerQids(state.activeChapter).length > 0;
        showToast(
            hasMastered ? '本章错题已全部掌握；如需重练请先切换“显示全部错题”。' : '本章没有错题，无法开始测试。',
            'info'
        );
        return;
    }
    const questionPool = chapterWrongQids.map(qid => state.question_lookup[qid]).filter(Boolean);
    startQuiz(questionPool, 0, `【${state.activeChapter}】错题测试`);
}

export function startLastWrongQuizTest() {
    if (!state.lastWrongQuizQuestions.length) {
        showToast('本次测试没有错题可重练。', 'info');
        return;
    }
    startQuiz(state.lastWrongQuizQuestions, 0, '本次错题重练');
}

function handleExamTimeout() {
    if (state.quizFinalized) return;
    if (isModalOpen('app-confirm-modal')) {
        closeModal('app-confirm-modal');
    }
    showToast('考试时间到，已自动提交试卷。', 'warning', 4500);

    if (state.quizDelivery === 'sheet') {
        finalizeSheetExam({ timedOut: true });
        return;
    }

    if (state.quizState === 'ANSWERING') {
        const selectedOption = typeof document !== 'undefined'
            ? document.querySelector('input[name="quizOption"]:checked')
            : null;
        if (selectedOption) {
            submitQuizAnswer(false);
        }
    }
    showQuizResults();
}

export function startMockExam(options = {}) {
    const mcqPool = options.mcqPool || globalThis.mcq_data || [];
    const tfPool = options.tfPool || globalThis.tf_data || [];
    const preset = options.preset || 'standard';
    const delivery = options.delivery === 'sheet' ? 'sheet' : 'instant';

    const presetLimits = {
        standard: { mcq: 30, tf: 20, minutes: 20, label: '模拟考试 (20分钟)' },
        quick: { mcq: 15, tf: 10, minutes: 10, label: '快速模拟 (10分钟)' },
        full: { mcq: mcqPool.length, tf: tfPool.length, minutes: 0, label: '全量模拟测试' }
    };
    const cfg = presetLimits[preset] || presetLimits.standard;

    const mcqs = shuffleQuestions(mcqPool).slice(0, cfg.mcq);
    const tfs = shuffleQuestions(tfPool).slice(0, cfg.tf);
    const questions = shuffleQuestions([...mcqs, ...tfs]);
    if (questions.length === 0) {
        showToast('没有符合当前筛选条件的题目，无法开始测试。', 'warning');
        return;
    }

    startQuiz(questions, questions.length, `${cfg.label}${options.titleSuffix || ''}`, {
        alreadyShuffled: true,
        delivery
    });

    state.quizMode = 'exam';
    const timerEl = document.getElementById('quiz-timer');
    clearExamTimer();

    if (cfg.minutes > 0 && timerEl) {
        timerEl.style.display = 'block';
        examDeadline = Date.now() + cfg.minutes * 60 * 1000;

        const syncRemaining = () => {
            if (!examDeadline || state.quizFinalized) return;
            const remaining = Math.max(0, Math.ceil((examDeadline - Date.now()) / 1000));
            state.examTimeRemaining = remaining;
            updateTimerDisplay();
            if (remaining <= 0) {
                clearExamTimer();
                handleExamTimeout();
            }
        };

        syncRemaining();
        state.examTimerInterval = setInterval(syncRemaining, 500);
        if (typeof document !== 'undefined') {
            examVisibilityHandler = () => {
                if (!document.hidden) syncRemaining();
            };
            document.addEventListener('visibilitychange', examVisibilityHandler);
        }
    }
}

export function startQuiz(questionPool, numQuestions, title, options = {}) {
    state.score = 0;
    state.currentQuestionIndex = 0;
    state.quizAnswers = [];
    state.lastWrongQuizQuestions = [];
    state.quizMode = 'practice';
    state.quizDelivery = options.delivery === 'sheet' ? 'sheet' : 'instant';
    state.quizFinalized = false;

    const shuffled = options.alreadyShuffled ? [...questionPool] : shuffleQuestions(questionPool);
    state.quizQuestions = (numQuestions > 0 && numQuestions < shuffled.length)
        ? shuffled.slice(0, numQuestions)
        : shuffled;
    state.quizLength = state.quizQuestions.length;
    quizDraftAnswers = new Array(state.quizLength).fill(null);
    quizFlaggedSet = new Set();

    if (state.quizLength === 0) {
        showToast('没有可供测试的题目。', 'warning');
        return;
    }

    clearExamTimer();

    document.getElementById('quiz-title').textContent = title;
    document.getElementById('quiz-score').style.display = 'none';
    document.getElementById('quiz-content').style.display = 'block';
    document.getElementById('quiz-timer').style.display = 'none';

    configureModal('quiz-modal', {
        closeOnBackdrop: false,
        onBeforeClose: async () => {
            if (!state.quizFinalized && (state.quizState === 'ANSWERING' || state.quizState === 'FEEDBACK')) {
                return confirmDialog({
                    title: '退出当前测试',
                    message: '测试尚未完成，确定要提前退出吗？当前未完成部分的成绩将不会结算。',
                    confirmText: '退出测试',
                    cancelText: '继续答题',
                    danger: true
                });
            }
            return true;
        },
        onAfterClose: () => {
            clearExamTimer();
            const timerEl = document.getElementById('quiz-timer');
            if (timerEl) timerEl.style.display = 'none';
            state.quizState = 'IDLE';
        }
    });

    openModal('quiz-modal');
    displayQuizQuestion();
}

export function updateTimerDisplay() {
    const m = Math.floor(Math.max(0, state.examTimeRemaining) / 60).toString().padStart(2, '0');
    const s = (Math.max(0, state.examTimeRemaining) % 60).toString().padStart(2, '0');
    const timerEl = document.getElementById('quiz-timer');
    if (!timerEl) return;
    timerEl.textContent = `${m}:${s}`;
    timerEl.style.color = state.examTimeRemaining < 60 ? 'var(--error)' : 'var(--primary)';
}

export function closeQuiz(force = false) {
    if (force) {
        closeModal('quiz-modal');
        return;
    }
    requestCloseModal('quiz-modal');
}

function buildKeyboardHint(question, optionKeys) {
    const isSheet = state.quizDelivery === 'sheet';
    if (question.type === 'tf') {
        return isSheet
            ? '提示：使用键盘 T/1(对) / F/2(错) 选择，←/→ 或 Enter 切换题目。'
            : '提示：使用键盘 T/1(对) / F/2(错) 选择，Enter 提交答案/下一题，Space 跳过。';
    }
    const letters = optionKeys.filter(Boolean).join('/');
    const numbers = optionKeys.length > 0
        ? (optionKeys.length === 1 ? '1' : `1-${optionKeys.length}`)
        : '1-3';
    const keyDesc = letters ? `${letters} 或 ${numbers}` : numbers;
    return isSheet
        ? `提示：使用键盘 ${keyDesc} 选择，←/→ 或 Enter 切换题目。`
        : `提示：使用键盘 ${keyDesc} 选择，Enter 提交答案/下一题，Space 跳过。`;
}

function renderQuizSheetNav() {
    const navEl = document.getElementById('quiz-sheet-nav');
    if (!navEl) return;
    if (state.quizDelivery !== 'sheet') {
        navEl.style.display = 'none';
        navEl.innerHTML = '';
        return;
    }

    navEl.style.display = 'flex';
    navEl.innerHTML = state.quizQuestions.map((_, idx) => {
        const classes = ['quiz-sheet-btn'];
        if (idx === state.currentQuestionIndex) classes.push('is-current');
        if (quizDraftAnswers[idx]) classes.push('is-answered');
        if (quizFlaggedSet.has(idx)) classes.push('is-flagged');
        return `<button type="button" class="${classes.join(' ')}" data-quiz-jump="${idx}" aria-label="第 ${idx + 1} 题"${idx === state.currentQuestionIndex ? ' aria-current="step"' : ''}>${idx + 1}</button>`;
    }).join('');
}

function syncQuizFlagButton() {
    const flagBtn = document.getElementById('quiz-flag-btn');
    if (!flagBtn) return;
    if (state.quizDelivery !== 'sheet') {
        flagBtn.style.display = 'none';
        return;
    }
    const flagged = quizFlaggedSet.has(state.currentQuestionIndex);
    flagBtn.style.display = 'inline-flex';
    flagBtn.classList.toggle('is-flagged', flagged);
    flagBtn.setAttribute('aria-pressed', String(flagged));
    flagBtn.innerHTML = flagged
        ? '<i data-lucide="flag"></i> 已标存疑'
        : '<i data-lucide="flag"></i> 标记存疑';
    renderIcons(flagBtn);
}

export function setSheetDraftAnswer(index, value) {
    if (index < 0 || index >= state.quizLength) return;
    quizDraftAnswers[index] = value;
    renderQuizSheetNav();
}

export function getQuizDraftAnswers() {
    return [...quizDraftAnswers];
}

export function jumpToQuizQuestion(index) {
    if (state.quizDelivery !== 'sheet' || state.quizFinalized) return;
    const target = Number(index);
    if (!Number.isInteger(target) || target < 0 || target >= state.quizLength) return;
    state.currentQuestionIndex = target;
    displayQuizQuestion();
}

export function prevQuizQuestion() {
    if (state.quizDelivery !== 'sheet' || state.quizFinalized) return;
    if (state.currentQuestionIndex > 0) {
        state.currentQuestionIndex--;
        displayQuizQuestion();
    }
}

export function toggleQuizFlag() {
    if (state.quizDelivery !== 'sheet' || state.quizFinalized) return;
    const idx = state.currentQuestionIndex;
    if (quizFlaggedSet.has(idx)) {
        quizFlaggedSet.delete(idx);
    } else {
        quizFlaggedSet.add(idx);
    }
    syncQuizFlagButton();
    renderQuizSheetNav();
}

function finalizeSheetExam() {
    if (state.quizFinalized) return;
    const quizTitle = document.getElementById('quiz-title')?.textContent || '模拟考试';

    state.score = 0;
    state.quizAnswers = state.quizQuestions.map((question, idx) => {
        const draft = quizDraftAnswers[idx];
        const skipped = !draft;
        const normalizedCorrect = String(question.answer || '').trim().toUpperCase();
        const normalizedUser = skipped ? '' : String(draft).trim().toUpperCase();
        const isCorrect = !skipped && normalizedUser === normalizedCorrect;

        updateStats(question, isCorrect);
        if (isCorrect) {
            state.score++;
            recordCorrectPractice(question);
        } else {
            recordWrongAnswer(question, quizTitle);
        }

        return {
            qid: question.qid,
            userAnswer: skipped ? '未作答' : draft,
            correctAnswer: question.answer,
            isCorrect,
            skipped,
            chapter: question.chapter,
            type: question.type
        };
    });

    updateChapterNavStatus();
    showQuizResults();
}

export async function finishExamQuiz() {
    if (state.quizDelivery !== 'sheet' || state.quizFinalized) return;
    const unanswered = quizDraftAnswers.filter(val => !val).length;
    if (unanswered > 0) {
        const confirmed = await confirmDialog({
            title: '确认交卷',
            message: `还有 ${unanswered} 道题尚未作答，确定现在交卷结算吗？`,
            confirmText: '立即交卷',
            cancelText: '继续检查'
        });
        if (!confirmed) return;
    }
    finalizeSheetExam();
}

export function displayQuizQuestion() {
    if (state.currentQuestionIndex < state.quizLength) {
        const question = state.quizQuestions[state.currentQuestionIndex];
        const questionContainer = document.getElementById('quiz-question-container');
        const instructionsEl = document.getElementById('keyboard-instructions');
        const optionKeys = [];

        document.getElementById('quiz-question-text').innerHTML = formatInlineHtml(question.question);
        const optionsContainer = document.getElementById('quiz-options');
        optionsContainer.innerHTML = '';
        if (!optionsContainer.dataset.sheetBound) {
            optionsContainer.dataset.sheetBound = 'true';
            optionsContainer.addEventListener('change', event => {
                if (state.quizDelivery !== 'sheet' || state.quizFinalized) return;
                if (event.target?.name === 'quizOption') {
                    setSheetDraftAnswer(state.currentQuestionIndex, event.target.value);
                }
            });
        }

        const favBtn = document.getElementById('quiz-favorite-btn');
        const isFav = state.favorites.includes(question.qid);
        favBtn.style.display = 'inline-flex';
        favBtn.className = `action-button favorite-button ${isFav ? 'favorited' : ''}`;
        favBtn.innerHTML = isFav ? '<i data-lucide="star"></i> 已收藏' : '<i data-lucide="star"></i> 收藏';
        favBtn.dataset.qid = question.qid;
        favBtn.dataset.action = 'toggleFavorite';
        renderIcons(favBtn);

        const currentDraft = state.quizDelivery === 'sheet' ? quizDraftAnswers[state.currentQuestionIndex] : null;

        if (question.type === 'mcq') {
            (question.options || []).forEach(rawOption => {
                const { key, text } = parseMcqOption(rawOption);
                optionKeys.push(key);
                const label = document.createElement('label');
                label.className = 'quiz-option-item';
                const radio = Object.assign(document.createElement('input'), {
                    type: 'radio',
                    name: 'quizOption',
                    value: key,
                    checked: Boolean(currentDraft && currentDraft === key)
                });
                label.innerHTML = `
                    <span class="quiz-option-key">${escapeHtml(key)}</span>
                    <span class="quiz-option-text">${formatInlineHtml(text)}</span>
                `;
                label.prepend(radio);
                optionsContainer.appendChild(label);
            });
        } else {
            const labelTrue = document.createElement('label');
            labelTrue.className = 'quiz-option-item quiz-option-tf';
            const radioTrue = Object.assign(document.createElement('input'), {
                type: 'radio',
                name: 'quizOption',
                value: '✓',
                checked: currentDraft === '✓'
            });
            labelTrue.innerHTML = `
                <span class="quiz-option-key"><i data-lucide="check"></i></span>
                <span class="quiz-option-text">正确</span>
            `;
            labelTrue.prepend(radioTrue);

            const labelFalse = document.createElement('label');
            labelFalse.className = 'quiz-option-item quiz-option-tf';
            const radioFalse = Object.assign(document.createElement('input'), {
                type: 'radio',
                name: 'quizOption',
                value: '×',
                checked: currentDraft === '×'
            });
            labelFalse.innerHTML = `
                <span class="quiz-option-key"><i data-lucide="x"></i></span>
                <span class="quiz-option-text">错误</span>
            `;
            labelFalse.prepend(radioFalse);

            optionsContainer.appendChild(labelTrue);
            optionsContainer.appendChild(labelFalse);
            renderIcons(optionsContainer);
        }

        instructionsEl.textContent = buildKeyboardHint(question, optionKeys);
        document.getElementById('quiz-progress').textContent = `进度: ${state.currentQuestionIndex + 1} / ${state.quizLength}`;
        document.getElementById('quiz-feedback').style.display = 'none';

        const prevBtn = document.getElementById('prev-question-btn');
        const submitBtn = document.getElementById('submit-answer-btn');
        const nextBtn = document.getElementById('next-question-btn');
        const finishBtn = document.getElementById('finish-exam-btn');

        if (state.quizDelivery === 'sheet') {
            if (prevBtn) {
                prevBtn.style.display = 'inline-flex';
                prevBtn.disabled = state.currentQuestionIndex === 0;
            }
            if (submitBtn) submitBtn.style.display = 'none';
            if (nextBtn) {
                nextBtn.style.display = state.currentQuestionIndex < state.quizLength - 1 ? 'inline-flex' : 'none';
            }
            if (finishBtn) finishBtn.style.display = 'inline-flex';
        } else {
            if (prevBtn) prevBtn.style.display = 'none';
            if (submitBtn) submitBtn.style.display = 'inline-flex';
            if (nextBtn) nextBtn.style.display = 'none';
            if (finishBtn) finishBtn.style.display = 'none';
        }

        syncQuizFlagButton();
        renderQuizSheetNav();
        typesetMath([questionContainer]);

        state.quizState = 'ANSWERING';
        state.quizFinalized = false;
    } else {
        showQuizResults();
    }
}

export function submitQuizAnswer(skipped = false) {
    if (state.quizFinalized || state.quizState !== 'ANSWERING') return;

    let userAnswer = null;
    if (!skipped) {
        const selectedOption = document.querySelector('input[name="quizOption"]:checked');
        if (!selectedOption) {
            showToast('请先选择一个答案。', 'warning');
            return;
        }
        userAnswer = selectedOption.value;
    }

    const question = state.quizQuestions[state.currentQuestionIndex];
    if (!question) return;

    const normalizedCorrect = String(question.answer || '').trim().toUpperCase();
    const normalizedUser = skipped ? '' : String(userAnswer || '').trim().toUpperCase();
    const isCorrect = !skipped && (normalizedUser === normalizedCorrect);

    state.quizAnswers[state.currentQuestionIndex] = {
        qid: question.qid,
        userAnswer: skipped ? '跳过' : userAnswer,
        correctAnswer: question.answer,
        isCorrect,
        skipped,
        chapter: question.chapter,
        type: question.type
    };

    updateStats(question, isCorrect);

    if (isCorrect) {
        state.score++;
        recordCorrectPractice(question);
    } else {
        recordWrongAnswer(question, document.getElementById('quiz-title')?.textContent || 'quiz');
        updateChapterNavStatus();
    }

    const feedbackEl = document.getElementById('quiz-feedback');
    feedbackEl.className = isCorrect ? 'correct' : 'incorrect';
    const explanationHtml = renderMarkdown(question.explanation || '暂无解析');
    const feedbackPrefix = isCorrect ? '回答正确！' : (skipped ? '已跳过。' : '回答错误。');
    const answerHint = isCorrect ? '' : `正确答案是：<strong>${escapeHtml(question.answer)}</strong>`;

    feedbackEl.innerHTML = `${feedbackPrefix}${answerHint}<div class="explanation-span">解析：${explanationHtml}</div>`;
    feedbackEl.style.display = 'block';

    typesetMath([feedbackEl]);

    document.getElementById('submit-answer-btn').style.display = 'none';
    document.getElementById('next-question-btn').style.display = 'inline-flex';
    state.quizState = 'FEEDBACK';
}

export function nextQuizQuestion() {
    if (state.quizDelivery === 'sheet') {
        if (state.currentQuestionIndex < state.quizLength - 1 && !state.quizFinalized) {
            state.currentQuestionIndex++;
            displayQuizQuestion();
        }
        return;
    }
    if (state.quizState !== 'FEEDBACK') return;
    state.currentQuestionIndex++;
    displayQuizQuestion();
}

export function showQuizResults() {
    if (state.quizFinalized) return;
    state.quizFinalized = true;
    clearExamTimer();
    document.getElementById('quiz-timer').style.display = 'none';
    document.getElementById('quiz-content').style.display = 'none';
    const sheetNav = document.getElementById('quiz-sheet-nav');
    if (sheetNav) sheetNav.style.display = 'none';
    const flagBtn = document.getElementById('quiz-flag-btn');
    if (flagBtn) flagBtn.style.display = 'none';
    const prevBtn = document.getElementById('prev-question-btn');
    if (prevBtn) prevBtn.style.display = 'none';
    const finishBtn = document.getElementById('finish-exam-btn');
    if (finishBtn) finishBtn.style.display = 'none';
    const scoreEl = document.getElementById('quiz-score');
    scoreEl.style.display = 'block';

    state.lastWrongQuizQuestions = state.quizQuestions
        .map((question, index) => {
            const answer = state.quizAnswers[index];
            return !answer || !answer.isCorrect ? question : null;
        })
        .filter(Boolean);

    const reviewItems = state.quizQuestions.map((question, index) => {
        const answer = state.quizAnswers[index] || {
            userAnswer: '未作答',
            correctAnswer: question.answer,
            isCorrect: false,
            skipped: true
        };
        const statusText = answer.isCorrect
            ? '正确'
            : (answer.userAnswer === '未作答' ? '未作答' : (answer.skipped ? '跳过' : '错误'));
        const explanationHtml = renderMarkdown(question.explanation || '暂无解析');
        const optionsMarkup = question.type === 'mcq'
            ? `<ul>${(question.options || []).map(option => `<li>${formatInlineHtml(option)}</li>`).join('')}</ul>`
            : '';

        return `
            <details class="quiz-review-item ${answer.isCorrect ? 'is-correct' : 'is-wrong'}">
                <summary>
                    <span>第 ${index + 1} 题</span>
                    <strong>${statusText}</strong>
                </summary>
                <p>${formatInlineHtml(question.question)}</p>
                ${optionsMarkup}
                <div class="quiz-review-answer">
                    <span>你的答案：${escapeHtml(answer.userAnswer)}</span>
                    <span>正确答案：${escapeHtml(question.answer)}</span>
                </div>
                <div class="explanation-span"><b>解析：</b>${explanationHtml}</div>
            </details>
        `;
    }).join('');

    const wrongRetryButton = state.lastWrongQuizQuestions.length > 0
        ? '<button type="button" class="quiz-button" data-action="startLastWrongQuizTest"><i data-lucide="rotate-cw"></i> 重练本次错题</button>'
        : '';

    const accuracyPct = state.quizLength > 0 ? Math.round((state.score / state.quizLength) * 100) : 0;
    const gradeLevel = accuracyPct >= 90 ? '掌握熟练' : (accuracyPct >= 60 ? '达到及格' : '建议巩固');

    scoreEl.innerHTML = `
        <div class="quiz-result-hero">
            <div class="quiz-result-tag"><i data-lucide="check-circle-2"></i> 测试结果 · ${gradeLevel}</div>
            <h3 class="quiz-result-headline">本次测试完成</h3>
        </div>
        <div class="quiz-score-hud">
            <div class="quiz-hud-card">
                <span class="hud-label">答对 / 总题数</span>
                <strong class="hud-value hud-score">${state.score} <span>/ ${state.quizLength}</span></strong>
            </div>
            <div class="quiz-hud-card">
                <span class="hud-label">正确率</span>
                <strong class="hud-value hud-rate">${accuracyPct}%</strong>
            </div>
            <div class="quiz-hud-card">
                <span class="hud-label">本次错题</span>
                <strong class="hud-value hud-wrong">${state.lastWrongQuizQuestions.length} <span>题</span></strong>
            </div>
        </div>
        <div class="quiz-result-actions">
            ${wrongRetryButton}
            <button type="button" class="action-button quiz-button-close" data-action="closeQuiz"><i data-lucide="check"></i> 完成并退出</button>
        </div>
        <div class="quiz-review-heading">
            <h4><i data-lucide="file-text"></i> 答题详情与解析</h4>
        </div>
        <div class="quiz-review-list">${reviewItems}</div>
    `;

    renderIcons(scoreEl);
    typesetMath([scoreEl]);

    // 折叠详情展开时补排公式，防止隐藏状态下 MathJax 计算宽高异常
    scoreEl.querySelectorAll('.quiz-review-item').forEach(detail => {
        detail.addEventListener('toggle', () => {
            if (detail.open) {
                typesetMath([detail]);
            }
        }, { once: true });
    });

    state.quizState = 'IDLE';
}
