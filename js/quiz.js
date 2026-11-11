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
import { closeModal, confirmDialog, configureModal, openModal, requestCloseModal } from './modal.js';
import { getWrongAnswerQids, recordCorrectPractice, recordWrongAnswer, updateStats } from './storage.js';
import { updateChapterNavStatus } from './ui.js';

const randomTestState = {
    mode: 'exam',
    source: 'all',
    selectedChapters: null,
    questionCount: 20,
    examPreset: 'standard'
};

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

function matchesRandomSource(question, wrongQids) {
    if (randomTestState.source === 'favorites') {
        return state.favorites.includes(question.qid);
    }
    if (randomTestState.source === 'wrong') {
        return wrongQids.has(question.qid);
    }
    return true;
}

function buildQuestionPool(type = null) {
    const selectedChapters = new Set(getSelectedChapters());
    const wrongQids = new Set(getWrongAnswerQids());
    const questions = [];

    selectedChapters.forEach(chapterName => {
        const chapter = state.all_data[chapterName];
        if (!chapter) return;
        const chapterQuestions = type
            ? chapter[type]
            : [...chapter.mcq, ...chapter.tf];
        questions.push(...chapterQuestions.filter(question => matchesRandomSource(question, wrongQids)));
    });

    return questions;
}

function getChapterQuestionCount(chapterName) {
    const chapter = state.all_data[chapterName];
    if (!chapter) return 0;
    const chapterQuestions = randomTestState.mode === 'exam'
        ? [...chapter.mcq, ...chapter.tf]
        : chapter[randomTestState.mode];
    const wrongQids = new Set(getWrongAnswerQids());
    return chapterQuestions.filter(question => matchesRandomSource(question, wrongQids)).length;
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
        wrong: '错题',
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
    modal.innerHTML = `
        <div class="modal-content random-test-panel">
            <button class="close-modal" type="button" id="close-random-test-modal" aria-label="关闭" title="关闭"><i data-lucide="x"></i></button>
            <h2 id="random-test-title"><i data-lucide="sliders-horizontal"></i> 随机测试设置</h2>
            <div class="random-test-section">
                <div class="random-test-section-title">抽题来源</div>
                <div class="random-source-options">
                    <label><input type="radio" name="random-test-source" value="all" checked> 全部题目</label>
                    <label><input type="radio" name="random-test-source" value="wrong"> 只抽错题</label>
                    <label><input type="radio" name="random-test-source" value="favorites"> 只抽收藏</label>
                </div>
            </div>
            <div class="random-test-section" id="random-test-count-section">
                <div class="random-test-section-title" id="random-test-count-label">抽题数量</div>
                <div class="random-count-options" id="random-count-options"></div>
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
        modeLabel = `模拟考试：池内共 ${mcqCount} 道单选、${tfCount} 道判断`;
    } else {
        const limitLabel = randomTestState.questionCount > 0
            ? `抽取最多 ${Math.min(randomTestState.questionCount, total)} 道（池内共 ${total} 道）`
            : `全部 ${total} 道`;
        modeLabel = `${randomTestState.mode === 'mcq' ? '选择题' : '判断题'}随机测试：${limitLabel}`;
    }
    summary.textContent = `已选 ${selectedCount} 个章节，来源：${sourceLabel}，${modeLabel}`;
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
    const allWrongQids = getWrongAnswerQids();
    if (allWrongQids.length === 0) {
        showToast('您的错题本是空的，无法开始测试。', 'info');
        return;
    }
    const questionPool = allWrongQids.map(qid => state.question_lookup[qid]).filter(Boolean);
    startQuiz(questionPool, 0, '所有错题随机测试');
}

export function startCurrentChapterWrongAnswersTest() {
    if (!state.activeChapter) return;
    const chapterWrongQids = getWrongAnswerQids(state.activeChapter);
    if (chapterWrongQids.length === 0) {
        showToast('本章没有错题，无法开始测试。', 'info');
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

export function startMockExam(options = {}) {
    const mcqPool = options.mcqPool || globalThis.mcq_data || [];
    const tfPool = options.tfPool || globalThis.tf_data || [];
    const preset = options.preset || 'standard';

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

    startQuiz(questions, questions.length, `${cfg.label}${options.titleSuffix || ''}`, { alreadyShuffled: true });

    state.quizMode = 'exam';
    const timerEl = document.getElementById('quiz-timer');
    if (state.examTimerInterval) {
        clearInterval(state.examTimerInterval);
        state.examTimerInterval = null;
    }

    if (cfg.minutes > 0 && timerEl) {
        timerEl.style.display = 'block';
        state.examTimeRemaining = cfg.minutes * 60;
        updateTimerDisplay();

        state.examTimerInterval = setInterval(() => {
            state.examTimeRemaining--;
            updateTimerDisplay();
            if (state.examTimeRemaining <= 0) {
                clearInterval(state.examTimerInterval);
                state.examTimerInterval = null;
                showToast('考试时间到，已自动提交试卷。', 'warning', 4500);
                showQuizResults();
            }
        }, 1000);
    }
}

export function startQuiz(questionPool, numQuestions, title, options = {}) {
    state.score = 0;
    state.currentQuestionIndex = 0;
    state.quizAnswers = [];
    state.lastWrongQuizQuestions = [];
    state.quizMode = 'practice';
    state.quizFinalized = false;

    const shuffled = options.alreadyShuffled ? [...questionPool] : shuffleQuestions(questionPool);
    state.quizQuestions = (numQuestions > 0 && numQuestions < shuffled.length)
        ? shuffled.slice(0, numQuestions)
        : shuffled;
    state.quizLength = state.quizQuestions.length;

    if (state.quizLength === 0) {
        showToast('没有可供测试的题目。', 'warning');
        return;
    }

    if (state.examTimerInterval) {
        clearInterval(state.examTimerInterval);
        state.examTimerInterval = null;
    }

    document.getElementById('quiz-title').textContent = title;
    document.getElementById('quiz-score').style.display = 'none';
    document.getElementById('quiz-content').style.display = 'block';
    document.getElementById('quiz-timer').style.display = 'none';

    configureModal('quiz-modal', {
        closeOnBackdrop: false,
        onBeforeClose: async () => {
            if (state.quizState === 'ANSWERING' || state.quizState === 'FEEDBACK') {
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
            if (state.examTimerInterval) {
                clearInterval(state.examTimerInterval);
                state.examTimerInterval = null;
            }
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

export function displayQuizQuestion() {
    if (state.currentQuestionIndex < state.quizLength) {
        const question = state.quizQuestions[state.currentQuestionIndex];
        const questionContainer = document.getElementById('quiz-question-container');
        const instructionsEl = document.getElementById('keyboard-instructions');

        instructionsEl.textContent = question.type === 'mcq'
            ? '提示：使用键盘 A/B/C/D 或 1/2/3/4 选择，Enter 提交答案/下一题，Space 跳过。'
            : '提示：使用键盘 T/1(对) / F/2(错) 选择，Enter 提交答案/下一题，Space 跳过。';

        document.getElementById('quiz-question-text').innerHTML = formatInlineHtml(question.question);
        const optionsContainer = document.getElementById('quiz-options');
        optionsContainer.innerHTML = '';

        const favBtn = document.getElementById('quiz-favorite-btn');
        const isFav = state.favorites.includes(question.qid);
        favBtn.style.display = 'inline-flex';
        favBtn.className = `action-button favorite-button ${isFav ? 'favorited' : ''}`;
        favBtn.innerHTML = isFav ? '<i data-lucide="star"></i> 已收藏' : '<i data-lucide="star"></i> 收藏';
        favBtn.dataset.qid = question.qid;
        favBtn.dataset.action = 'toggleFavorite';
        renderIcons(favBtn);

        if (question.type === 'mcq') {
            (question.options || []).forEach(rawOption => {
                const { key, text } = parseMcqOption(rawOption);
                const label = document.createElement('label');
                label.className = 'quiz-option-item';
                const radio = Object.assign(document.createElement('input'), {
                    type: 'radio',
                    name: 'quizOption',
                    value: key
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
                value: '✓'
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
                value: '×'
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

        document.getElementById('quiz-progress').textContent = `进度: ${state.currentQuestionIndex + 1} / ${state.quizLength}`;
        document.getElementById('quiz-feedback').style.display = 'none';
        document.getElementById('submit-answer-btn').style.display = 'inline-flex';
        document.getElementById('next-question-btn').style.display = 'none';

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
    if (state.quizState !== 'FEEDBACK') return;
    state.currentQuestionIndex++;
    displayQuizQuestion();
}

export function showQuizResults() {
    if (state.quizFinalized) return;
    state.quizFinalized = true;
    if (state.examTimerInterval) {
        clearInterval(state.examTimerInterval);
        state.examTimerInterval = null;
    }
    document.getElementById('quiz-timer').style.display = 'none';
    document.getElementById('quiz-content').style.display = 'none';
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
        const explanationHtml = renderMarkdown(question.explanation || '暂无解析');
        const optionsMarkup = question.type === 'mcq'
            ? `<ul>${(question.options || []).map(option => `<li>${formatInlineHtml(option)}</li>`).join('')}</ul>`
            : '';

        return `
            <details class="quiz-review-item ${answer.isCorrect ? 'is-correct' : 'is-wrong'}">
                <summary>
                    <span>第 ${index + 1} 题</span>
                    <strong>${answer.isCorrect ? '正确' : (answer.skipped ? '跳过' : '错误')}</strong>
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
