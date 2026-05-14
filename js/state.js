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
    questionPageSize: 30
};

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
}

export function processData() {
    window.mcq_data.forEach((q, i) => {
        registerQuestion(q, 'mcq', i);
    });

    window.tf_data.forEach((q, i) => {
        registerQuestion(q, 'tf', i);
    });
}
