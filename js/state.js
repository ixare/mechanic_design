export const state = {
    all_data: {},
    question_lookup: {},
    legacy_qid_lookup: {},
    original_question_lookup: {},
    favorites: [],
    wrongAnswersByChapter: {},
    quizQuestions: [],
    quizAnswers: [],
    lastWrongQuizQuestions: [],
    currentQuestionIndex: 0,
    score: 0,
    quizLength: 0,
    quizMode: 'practice',
    quizFinalized: false,
    activeView: 'home',
    activeChapterButton: null,
    activeChapter: null,
    activeType: null,
    quizState: 'IDLE',
    userStats: { total: 0, correct: 0, practicedQids: [], chapterStats: {} },
    practiceTrackProgress: true,
    cropper: null,
    examTimerInterval: null,
    examTimeRemaining: 0,
    currentQuestionList: [],
    currentRenderOptions: {},
    questionEdits: {},
    questionAdditions: {}
};

/**
 * 计算历史版本的文本哈希 QID，用于向后迁移老用户的收藏、错题与修订记录
 */
export function computeLegacyTextQuestionId(question, type) {
    const chapter = question.chapter || 'unknown';
    const text = `${question.question || ''}${question.answer || ''}`.replace(/\s+/g, '');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return `${chapter}-${type}-${Math.abs(hash).toString(36)}`;
}

/**
 * 预构建并缓存题目的检索索引文本，避免每次搜索重复拼接字符串
 */
export function updateQuestionSearchText(question) {
    if (!question) return;
    const parts = [
        question.chapter || '',
        question.question || '',
        Array.isArray(question.options) ? question.options.join(' ') : '',
        question.answer || '',
        question.explanation || ''
    ];
    question._searchText = parts.join(' ').toLowerCase();
}

/**
 * 读取本地题库数据（消除对不存在的 question.json 的无效网络请求）
 */
export function loadQuestionBank(customBank = null) {
    if (customBank && (Array.isArray(customBank.mcq) || Array.isArray(customBank.tf))) {
        return {
            mcq: Array.isArray(customBank.mcq) ? customBank.mcq : [],
            tf: Array.isArray(customBank.tf) ? customBank.tf : []
        };
    }

    return {
        mcq: Array.isArray(globalThis.mcq_data) ? globalThis.mcq_data : [],
        tf: Array.isArray(globalThis.tf_data) ? globalThis.tf_data : []
    };
}

function getCanonicalQuestionId(question, type, index) {
    if (question.id && typeof question.id === 'string') {
        return question.id;
    }
    const base = computeLegacyTextQuestionId(question, type);
    return state.question_lookup[base] ? `${base}-${index}` : base;
}

function registerQuestion(question, type, index) {
    const stableQid = getCanonicalQuestionId(question, type, index);
    const legacyIndexQid = `${type}_${index}`;
    const legacyTextQid = computeLegacyTextQuestionId(question, type);

    question.qid = stableQid;
    question.legacyQid = legacyIndexQid;
    question.type = type;
    updateQuestionSearchText(question);

    if (!state.all_data[question.chapter]) {
        state.all_data[question.chapter] = { mcq: [], tf: [] };
    }

    state.all_data[question.chapter][type].push(question);
    state.question_lookup[stableQid] = question;
    state.question_lookup[legacyIndexQid] = question;
    state.legacy_qid_lookup[legacyIndexQid] = stableQid;

    if (!state.legacy_qid_lookup[legacyTextQid]) {
        state.legacy_qid_lookup[legacyTextQid] = stableQid;
    }
    if (!state.question_lookup[legacyTextQid]) {
        state.question_lookup[legacyTextQid] = question;
    }

    state.original_question_lookup[stableQid] = {
        chapter: question.chapter,
        question: question.question,
        options: Array.isArray(question.options) ? [...question.options] : undefined,
        answer: question.answer,
        explanation: question.explanation || '',
        type
    };
}

/**
 * 解析并索引题库数据到全局状态
 */
export function processData(questionBank = null) {
    const source = loadQuestionBank(questionBank);

    state.all_data = {};
    state.question_lookup = {};
    state.legacy_qid_lookup = {};
    state.original_question_lookup = {};

    source.mcq.forEach((q, i) => {
        registerQuestion(q, 'mcq', i);
    });

    source.tf.forEach((q, i) => {
        registerQuestion(q, 'tf', i);
    });

    globalThis.mcq_data = source.mcq;
    globalThis.tf_data = source.tf;
}
