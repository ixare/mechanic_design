export const state = {
    all_data: {},
    question_lookup: {},
    favorites: [],
    wrongAnswersByChapter: {},
    quizQuestions: [],
    currentQuestionIndex: 0,
    score: 0,
    quizLength: 0,
    activeChapterButton: null,
    activeChapter: null,
    activeType: null,
    quizState: 'IDLE',
    userStats: { total: 0, correct: 0, chapterStats: {} },
    cropper: null,
    examTimerInterval: null,
    examTimeRemaining: 0
};

export function processData() {
    window.mcq_data.forEach((q, i) => {
        const qid = `mcq_${i}`;
        q.qid = qid;
        q.type = 'mcq'; 
        if (!state.all_data[q.chapter]) {
            state.all_data[q.chapter] = { mcq: [], tf: [] };
        }
        state.all_data[q.chapter].mcq.push(q); 
        state.question_lookup[qid] = q;
    });

    window.tf_data.forEach((q, i) => {
        const qid = `tf_${i}`;
        q.qid = qid;
        q.type = 'tf'; 
        if (!state.all_data[q.chapter]) {
            state.all_data[q.chapter] = { mcq: [], tf: [] };
        }
        state.all_data[q.chapter].tf.push(q); 
        state.question_lookup[qid] = q;
    });
}
