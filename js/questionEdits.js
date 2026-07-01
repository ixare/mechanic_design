import { state } from './state.js';

export const QUESTION_EDITS_KEY = 'mech_design_question_edits';

function cloneOptions(options) {
    return Array.isArray(options) ? options.map(option => String(option || '')) : undefined;
}

function getQuestionSnapshot(question) {
    if (!question) return null;
    const snapshot = {
        question: String(question.question || ''),
        answer: String(question.answer || ''),
        explanation: String(question.explanation || '')
    };
    if (question.type === 'mcq') {
        snapshot.options = cloneOptions(question.options) || [];
    }
    return snapshot;
}

function snapshotsEqual(a, b) {
    if (!a || !b) return false;
    if (a.question !== b.question || a.answer !== b.answer || a.explanation !== b.explanation) return false;
    const leftOptions = a.options || [];
    const rightOptions = b.options || [];
    if (leftOptions.length !== rightOptions.length) return false;
    return leftOptions.every((option, index) => option === rightOptions[index]);
}

function applySnapshot(question, snapshot) {
    if (!question || !snapshot) return;
    question.question = snapshot.question;
    question.answer = snapshot.answer;
    question.explanation = snapshot.explanation;
    if (question.type === 'mcq' && Array.isArray(snapshot.options)) {
        question.options = cloneOptions(snapshot.options);
    }
}

function getOriginalSnapshot(qid) {
    const original = state.original_question_lookup[qid];
    if (!original) return null;
    return {
        question: original.question || '',
        answer: original.answer || '',
        explanation: original.explanation || '',
        options: cloneOptions(original.options)
    };
}

function persistQuestionEdits() {
    localStorage.setItem(QUESTION_EDITS_KEY, JSON.stringify(state.questionEdits));
}

export function loadQuestionEdits() {
    const stored = localStorage.getItem(QUESTION_EDITS_KEY);
    try {
        const parsed = stored ? JSON.parse(stored) : {};
        state.questionEdits = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        console.error('Failed to parse question edits', error);
        state.questionEdits = {};
    }

    Object.entries(state.questionEdits).forEach(([qid, snapshot]) => {
        const question = state.question_lookup[qid];
        const original = getOriginalSnapshot(qid);
        if (!question || !original || !snapshot || typeof snapshot !== 'object') {
            delete state.questionEdits[qid];
            return;
        }
        applySnapshot(question, {
            question: String(snapshot.question ?? original.question),
            answer: String(snapshot.answer ?? original.answer),
            explanation: String(snapshot.explanation ?? original.explanation),
            options: question.type === 'mcq'
                ? cloneOptions(snapshot.options || original.options || [])
                : undefined
        });
    });

    persistQuestionEdits();
}

export function hasQuestionEdit(qid) {
    return Boolean(state.questionEdits[qid]);
}

export function getQuestionEditCount() {
    return Object.keys(state.questionEdits).length;
}

export function saveQuestionEdit(qid, values) {
    const question = state.question_lookup[qid];
    const original = getOriginalSnapshot(qid);
    if (!question || !original) return false;

    const nextSnapshot = {
        question: String(values.question || '').trim(),
        answer: String(values.answer || '').trim(),
        explanation: String(values.explanation || '').trim()
    };

    if (question.type === 'mcq') {
        nextSnapshot.options = String(values.optionsText || '')
            .split(/\r?\n/)
            .map(option => option.trim())
            .filter(Boolean);
    }

    if (!nextSnapshot.question || !nextSnapshot.answer) {
        throw new Error('题干和答案不能为空。');
    }

    if (question.type === 'mcq' && nextSnapshot.options.length === 0) {
        throw new Error('选择题至少需要保留一个选项。');
    }

    if (snapshotsEqual(nextSnapshot, original)) {
        delete state.questionEdits[qid];
        applySnapshot(question, original);
    } else {
        state.questionEdits[qid] = nextSnapshot;
        applySnapshot(question, nextSnapshot);
    }

    persistQuestionEdits();
    return true;
}

export function discardQuestionEdit(qid) {
    const question = state.question_lookup[qid];
    const original = getOriginalSnapshot(qid);
    if (!question || !original) return false;
    delete state.questionEdits[qid];
    applySnapshot(question, original);
    persistQuestionEdits();
    return true;
}

export function getQuestionSyncPayload() {
    const changes = Object.keys(state.questionEdits).map(qid => {
        const question = state.question_lookup[qid];
        return {
            qid,
            type: question?.type || state.original_question_lookup[qid]?.type || 'unknown',
            chapter: question?.chapter || state.original_question_lookup[qid]?.chapter || '',
            original: getOriginalSnapshot(qid),
            updated: state.questionEdits[qid]
        };
    }).filter(change => change.original && change.updated);

    return {
        schemaVersion: 1,
        targetFile: 'question.json',
        generatedAt: new Date().toISOString(),
        changeCount: changes.length,
        changes
    };
}

function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function downloadQuestionSyncPayload() {
    downloadJson(`question-sync-request-${new Date().toISOString().slice(0, 10)}.json`, getQuestionSyncPayload());
}

export async function copyQuestionSyncPayload() {
    const payload = JSON.stringify(getQuestionSyncPayload(), null, 2);
    await navigator.clipboard.writeText(payload);
}

export async function openQuestionSyncIssue() {
    const payload = JSON.stringify(getQuestionSyncPayload(), null, 2);
    const title = encodeURIComponent(`同步题库本地修订 ${new Date().toISOString().slice(0, 10)}`);
    const bodyText = payload.length < 6000
        ? `请将以下本地题目修订同步到 question.json：\n\n\`\`\`json\n${payload}\n\`\`\``
        : `本地题目修订较多，已复制同步申请 JSON。请将该 JSON 作为 question.json 同步依据。`;

    if (payload.length >= 6000) {
        await copyQuestionSyncPayload();
    }

    window.open(`https://github.com/ixare/mechanic_design/issues/new?title=${title}&body=${encodeURIComponent(bodyText)}&labels=question-sync`, '_blank');
}
