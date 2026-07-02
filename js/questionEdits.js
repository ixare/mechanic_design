import { state } from './state.js';

export const QUESTION_EDITS_KEY = 'mech_design_question_edits';
export const QUESTION_ADDITIONS_KEY = 'mech_design_question_additions';

function cloneOptions(options) {
    return Array.isArray(options) ? options.map(option => String(option || '')) : undefined;
}

function splitOptions(optionsText) {
    return String(optionsText || '')
        .split(/\r?\n/)
        .map(option => option.trim())
        .filter(Boolean);
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

function persistQuestionAdditions() {
    localStorage.setItem(QUESTION_ADDITIONS_KEY, JSON.stringify(state.questionAdditions));
}

function persistQuestionChanges() {
    persistQuestionEdits();
    persistQuestionAdditions();
}

function loadStoredObject(key) {
    const stored = localStorage.getItem(key);
    try {
        const parsed = stored ? JSON.parse(stored) : {};
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        console.error(`Failed to parse ${key}`, error);
        return {};
    }
}

function normalizeQuestionType(type) {
    return type === 'tf' ? 'tf' : 'mcq';
}

function normalizeQuestionAddition(raw, qid) {
    if (!raw || typeof raw !== 'object') return null;
    const type = normalizeQuestionType(raw.type);
    const addition = {
        chapter: String(raw.chapter || '').trim(),
        type,
        question: String(raw.question || '').trim(),
        answer: String(raw.answer || '').trim(),
        explanation: String(raw.explanation || '').trim(),
        createdAt: String(raw.createdAt || new Date().toISOString()),
        updatedAt: String(raw.updatedAt || raw.createdAt || new Date().toISOString())
    };

    if (type === 'mcq') {
        addition.options = Array.isArray(raw.options) ? splitOptions(raw.options.join('\n')) : splitOptions(raw.optionsText);
    }

    if (!qid || !addition.chapter || !addition.question || !addition.answer) return null;
    if (type === 'mcq' && addition.options.length === 0) return null;
    return addition;
}

function createLocalQuestionId() {
    return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureChapterBucket(chapter) {
    if (!state.all_data[chapter]) {
        state.all_data[chapter] = { mcq: [], tf: [] };
    }
}

function removeRuntimeQuestion(qid) {
    const current = state.question_lookup[qid];
    if (!current) return;

    const chapterBucket = state.all_data[current.chapter]?.[current.type];
    if (Array.isArray(chapterBucket)) {
        state.all_data[current.chapter][current.type] = chapterBucket.filter(question => question.qid !== qid);
    }

    const source = current.type === 'mcq' ? window.mcq_data : window.tf_data;
    if (Array.isArray(source)) {
        const index = source.findIndex(question => question.qid === qid);
        if (index >= 0) source.splice(index, 1);
    }

    const chapterData = state.all_data[current.chapter];
    if (chapterData && chapterData.mcq.length === 0 && chapterData.tf.length === 0) {
        delete state.all_data[current.chapter];
    }

    delete state.question_lookup[qid];
    if (current.legacyQid) delete state.question_lookup[current.legacyQid];
    delete state.legacy_qid_lookup[current.legacyQid || qid];
}

function applyQuestionAddition(qid, addition) {
    const normalized = normalizeQuestionAddition(addition, qid);
    if (!normalized) return false;

    removeRuntimeQuestion(qid);
    ensureChapterBucket(normalized.chapter);

    const question = {
        id: qid,
        qid,
        legacyQid: qid,
        chapter: normalized.chapter,
        type: normalized.type,
        question: normalized.question,
        answer: normalized.answer,
        explanation: normalized.explanation,
        isLocalAddition: true
    };
    if (normalized.type === 'mcq') {
        question.options = cloneOptions(normalized.options) || [];
    }

    state.all_data[normalized.chapter][normalized.type].push(question);
    if (normalized.type === 'mcq') {
        window.mcq_data.push(question);
    } else {
        window.tf_data.push(question);
    }
    state.question_lookup[qid] = question;
    state.question_lookup[question.legacyQid] = question;
    state.legacy_qid_lookup[question.legacyQid] = qid;
    return true;
}

function applyStoredQuestionAdditions() {
    Object.entries(state.questionAdditions).forEach(([qid, addition]) => {
        const normalized = normalizeQuestionAddition(addition, qid);
        if (!normalized) {
            delete state.questionAdditions[qid];
            return;
        }
        state.questionAdditions[qid] = normalized;
        applyQuestionAddition(qid, normalized);
    });
}

function saveQuestionAdditionFromEditModal(qid, values) {
    const current = state.questionAdditions[qid];
    if (!current) return false;

    const nextAddition = {
        ...current,
        question: String(values.question || '').trim(),
        answer: String(values.answer || '').trim(),
        explanation: String(values.explanation || '').trim(),
        updatedAt: new Date().toISOString()
    };

    if (current.type === 'mcq') {
        nextAddition.options = splitOptions(values.optionsText);
    }

    const normalized = normalizeQuestionAddition(nextAddition, qid);
    if (!normalized) {
        throw new Error(current.type === 'mcq' ? '章节、题干、选项和答案不能为空。' : '章节、题干和答案不能为空。');
    }

    state.questionAdditions[qid] = normalized;
    applyQuestionAddition(qid, normalized);
    persistQuestionAdditions();
    return true;
}

export function loadQuestionEdits() {
    state.questionAdditions = loadStoredObject(QUESTION_ADDITIONS_KEY);
    applyStoredQuestionAdditions();

    state.questionEdits = loadStoredObject(QUESTION_EDITS_KEY);
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

    persistQuestionChanges();
}

export function hasQuestionEdit(qid) {
    return Boolean(state.questionEdits[qid]);
}

export function hasQuestionAddition(qid) {
    return Boolean(state.questionAdditions[qid]);
}

export function getQuestionEditCount() {
    return Object.keys(state.questionEdits).length + Object.keys(state.questionAdditions).length;
}

export function saveQuestionEdit(qid, values) {
    if (hasQuestionAddition(qid)) {
        return saveQuestionAdditionFromEditModal(qid, values);
    }

    const question = state.question_lookup[qid];
    const original = getOriginalSnapshot(qid);
    if (!question || !original) return false;

    const nextSnapshot = {
        question: String(values.question || '').trim(),
        answer: String(values.answer || '').trim(),
        explanation: String(values.explanation || '').trim()
    };

    if (question.type === 'mcq') {
        nextSnapshot.options = splitOptions(values.optionsText);
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

export function saveQuestionAddition(values, qid = '') {
    const targetQid = qid || createLocalQuestionId();
    const existing = state.questionAdditions[targetQid];
    const now = new Date().toISOString();
    const nextAddition = {
        chapter: String(values.chapter || '').trim(),
        type: normalizeQuestionType(values.type),
        question: String(values.question || '').trim(),
        optionsText: values.optionsText,
        answer: String(values.answer || '').trim(),
        explanation: String(values.explanation || '').trim(),
        createdAt: existing?.createdAt || now,
        updatedAt: now
    };

    const normalized = normalizeQuestionAddition(nextAddition, targetQid);
    if (!normalized) {
        throw new Error(nextAddition.type === 'mcq' ? '章节、题干、选项和答案不能为空。' : '章节、题干和答案不能为空。');
    }

    state.questionAdditions[targetQid] = normalized;
    applyQuestionAddition(targetQid, normalized);
    persistQuestionAdditions();
    return targetQid;
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

export function discardQuestionAddition(qid) {
    if (!hasQuestionAddition(qid)) return false;
    removeRuntimeQuestion(qid);
    delete state.questionAdditions[qid];
    delete state.questionEdits[qid];
    persistQuestionChanges();
    return true;
}

function getUpdateChanges() {
    return Object.keys(state.questionEdits).map(qid => {
        const question = state.question_lookup[qid];
        return {
            operation: 'update',
            qid,
            type: question?.type || state.original_question_lookup[qid]?.type || 'unknown',
            chapter: question?.chapter || state.original_question_lookup[qid]?.chapter || '',
            original: getOriginalSnapshot(qid),
            updated: state.questionEdits[qid]
        };
    }).filter(change => change.original && change.updated);
}

function getAdditionChanges() {
    return Object.keys(state.questionAdditions).map(qid => {
        const addition = state.questionAdditions[qid];
        return {
            operation: 'add',
            qid,
            type: addition.type,
            chapter: addition.chapter,
            original: null,
            updated: {
                question: addition.question,
                options: cloneOptions(addition.options),
                answer: addition.answer,
                explanation: addition.explanation
            },
            createdAt: addition.createdAt,
            updatedAt: addition.updatedAt
        };
    });
}

export function getQuestionSyncPayload() {
    const updates = getUpdateChanges();
    const additions = getAdditionChanges();
    const changes = [...updates, ...additions];

    return {
        schemaVersion: 2,
        targetFile: 'question.json',
        generatedAt: new Date().toISOString(),
        changeCount: changes.length,
        updateCount: updates.length,
        additionCount: additions.length,
        updates,
        additions,
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
    const title = encodeURIComponent(`同步题库本地修订与新增题 ${new Date().toISOString().slice(0, 10)}`);
    const bodyText = payload.length < 6000
        ? `请将以下本地题目修订与新增题同步到 question.json：\n\n\`\`\`json\n${payload}\n\`\`\``
        : `本地题目修订与新增题较多，已复制同步申请 JSON。请将该 JSON 作为 question.json 同步依据。`;

    if (payload.length >= 6000) {
        await copyQuestionSyncPayload();
    }

    window.open(`https://github.com/ixare/mechanic_design/issues/new?title=${title}&body=${encodeURIComponent(bodyText)}&labels=question-sync`, '_blank');
}
