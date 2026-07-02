export const state = {
    all_data: {},
    question_lookup: {},
    legacy_qid_lookup: {},
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
    activeChapterButton: null,
    activeChapter: null,
    activeType: null,
    quizState: 'IDLE',
    userStats: { total: 0, correct: 0, chapterStats: {} },
    cropper: null,
    examTimerInterval: null,
    examTimeRemaining: 0,
    currentQuestionList: [],
    currentRenderOptions: {},
    currentPage: 1,
    questionPageSize: 30,
    questionEdits: {},
    questionAdditions: {},
    original_question_lookup: {}
};

function normalizeQuestionBankData(data) {
    if (!data || typeof data !== 'object') return null;

    const mcq = Array.isArray(data.mcq_data) ? data.mcq_data : data.mcq;
    const tf = Array.isArray(data.tf_data) ? data.tf_data : data.tf;

    if (!Array.isArray(mcq) && !Array.isArray(tf)) return null;

    return {
        mcq: Array.isArray(mcq) ? mcq : [],
        tf: Array.isArray(tf) ? tf : []
    };
}

export async function loadQuestionBank() {
    const fallback = {
        mcq: window.mcq_data || [],
        tf: window.tf_data || []
    };

    try {
        const response = await fetch('question.json', { cache: 'no-store' });
        if (!response.ok) return fallback;

        const data = await response.json();
        const normalized = normalizeQuestionBankData(data);
        return normalized || fallback;
    } catch (error) {
        console.info('question.json unavailable, falling back to questions.js');
        return fallback;
    }
}

function getStableQuestionId(question, type, index) {
    if (question.id) return question.id;
    const chapter = question.chapter || 'unknown';
    const text = `${question.question || ''}${question.answer || ''}`.replace(/\s+/g, '');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return `${chapter}-${type}-${Math.abs(hash).toString(36)}`;
}

function registerQuestion(question, type, index) {
    const baseQid = getStableQuestionId(question, type, index);
    const stableQid = state.question_lookup[baseQid] ? `${baseQid}-${index}` : baseQid;
    const legacyQid = `${type}_${index}`;
    question.qid = stableQid;
    question.legacyQid = legacyQid;
    question.type = type;

    if (!state.all_data[question.chapter]) {
        state.all_data[question.chapter] = { mcq: [], tf: [] };
    }

    state.all_data[question.chapter][type].push(question);
    state.question_lookup[stableQid] = question;
    state.question_lookup[legacyQid] = question;
    state.legacy_qid_lookup[legacyQid] = stableQid;
    state.original_question_lookup[stableQid] = {
        chapter: question.chapter,
        question: question.question,
        options: Array.isArray(question.options) ? [...question.options] : undefined,
        answer: question.answer,
        explanation: question.explanation || '',
        type
    };
}

export function processData(questionBank = null) {
    const source = questionBank || {
        mcq: window.mcq_data || [],
        tf: window.tf_data || []
    };

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

    window.mcq_data = source.mcq;
    window.tf_data = source.tf;
}
