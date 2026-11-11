import { state, updateQuestionSearchText } from './state.js';
import {
    copyTextToClipboard,
    downloadBlobFile,
    openExternalSafe,
    parseMcqOption,
    safeStorageSet
} from './utils.js';

export const QUESTION_EDITS_KEY = 'mech_design_question_edits';
export const QUESTION_ADDITIONS_KEY = 'mech_design_question_additions';

function cloneOptions(options) {
    return Array.isArray(options) ? options.map(option => String(option ?? '')) : undefined;
}

function splitOptions(optionsText) {
    return String(optionsText ?? '')
        .split(/\r?\n/)
        .map(option => option.trim())
        .filter(Boolean);
}

/**
 * 规范化并校验题目答案格式（选择题匹配选项首字母；判断题统一归一化为 ✓ / ×）
 */
export function normalizeQuestionAnswer(type, rawAnswer, options = []) {
    const answer = String(rawAnswer ?? '').trim();
    if (!answer) {
        throw new Error('题干和答案不能为空。');
    }

    if (type === 'tf') {
        const lower = answer.toLowerCase();
        if (['✓', '√', '对', '正确', 't', 'true', '1', 'y', 'yes'].includes(lower)) {
            return '✓';
        }
        if (['×', 'x', '错', '错误', 'f', 'false', '0', 'n', 'no'].includes(lower)) {
            return '×';
        }
        throw new Error('判断题答案请填写 ✓（正确）或 ×（错误）。');
    }

    if (!Array.isArray(options) || options.length < 2) {
        throw new Error('选择题至少需要保留两个选项。');
    }
    const keys = options.map(opt => parseMcqOption(opt).key);
    if (keys.some(k => !k)) {
        throw new Error('选择题每个选项需以字母开头（如 A．...）。');
    }
    const upper = answer.toUpperCase();
    if (!keys.includes(upper)) {
        throw new Error(`选择题答案 "${answer}" 需与选项字母（${keys.join(' / ')}）一致。`);
    }
    return upper;
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
    updateQuestionSearchText(question);
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
    safeStorageSet(QUESTION_EDITS_KEY, JSON.stringify(state.questionEdits));
}

function persistQuestionAdditions() {
    safeStorageSet(QUESTION_ADDITIONS_KEY, JSON.stringify(state.questionAdditions));
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

function normalizeQuestionAddition(raw, qid, strict = false) {
    if (!raw || typeof raw !== 'object') return null;
    const type = normalizeQuestionType(raw.type);
    const chapter = String(raw.chapter || '').trim();
    const question = String(raw.question || '').trim();
    const explanation = String(raw.explanation || '').trim();
    const options = type === 'mcq'
        ? (Array.isArray(raw.options) ? splitOptions(raw.options.join('\n')) : splitOptions(raw.optionsText))
        : undefined;

    if (!qid || !chapter || !question) {
        if (strict) throw new Error('章节、题干和答案不能为空。');
        return null;
    }

    let answer = String(raw.answer || '').trim();
    try {
        answer = normalizeQuestionAnswer(type, answer, options);
    } catch (err) {
        if (strict) throw err;
        // 兼容历史存储中不规范的旧数据
        if (!answer || (type === 'mcq' && (!options || options.length === 0))) return null;
    }

    const addition = {
        chapter,
        type,
        question,
        answer,
        explanation,
        createdAt: String(raw.createdAt || new Date().toISOString()),
        updatedAt: String(raw.updatedAt || raw.createdAt || new Date().toISOString())
    };

    if (type === 'mcq') {
        addition.options = options;
    }

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

    const source = current.type === 'mcq' ? globalThis.mcq_data : globalThis.tf_data;
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
    updateQuestionSearchText(question);

    state.all_data[normalized.chapter][normalized.type].push(question);
    if (normalized.type === 'mcq' && Array.isArray(globalThis.mcq_data)) {
        globalThis.mcq_data.push(question);
    } else if (normalized.type === 'tf' && Array.isArray(globalThis.tf_data)) {
        globalThis.tf_data.push(question);
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

    const normalized = normalizeQuestionAddition(nextAddition, qid, true);
    state.questionAdditions[qid] = normalized;
    applyQuestionAddition(qid, normalized);
    persistQuestionAdditions();
    return true;
}

/**
 * 加载本地新增与修订题目（自动兼容迁移旧版文本哈希 QID）
 */
export function loadQuestionEdits() {
    state.questionAdditions = loadStoredObject(QUESTION_ADDITIONS_KEY);
    applyStoredQuestionAdditions();

    const rawEdits = loadStoredObject(QUESTION_EDITS_KEY);
    const migratedEdits = {};

    Object.entries(rawEdits).forEach(([rawQid, snapshot]) => {
        const canonicalQid = state.legacy_qid_lookup[rawQid] || rawQid;
        const question = state.question_lookup[canonicalQid];
        const original = getOriginalSnapshot(canonicalQid);
        if (!question || !original || !snapshot || typeof snapshot !== 'object') {
            return;
        }
        const normalizedSnapshot = {
            question: String(snapshot.question ?? original.question),
            answer: String(snapshot.answer ?? original.answer),
            explanation: String(snapshot.explanation ?? original.explanation)
        };
        if (question.type === 'mcq') {
            normalizedSnapshot.options = cloneOptions(snapshot.options || original.options || []);
        }
        migratedEdits[canonicalQid] = normalizedSnapshot;
        applySnapshot(question, normalizedSnapshot);
    });

    state.questionEdits = migratedEdits;
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

    const options = question.type === 'mcq' ? splitOptions(values.optionsText) : undefined;
    const questionText = String(values.question || '').trim();
    if (!questionText) {
        throw new Error('题干和答案不能为空。');
    }

    const normalizedAnswer = normalizeQuestionAnswer(question.type, values.answer, options);
    const nextSnapshot = {
        question: questionText,
        answer: normalizedAnswer,
        explanation: String(values.explanation || '').trim()
    };

    if (question.type === 'mcq') {
        nextSnapshot.options = options;
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

    const normalized = normalizeQuestionAddition(nextAddition, targetQid, true);
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
        targetFile: 'questions.js',
        generatedAt: new Date().toISOString(),
        changeCount: changes.length,
        updateCount: updates.length,
        additionCount: additions.length,
        updates,
        additions,
        changes
    };
}

export function downloadQuestionSyncPayload() {
    downloadBlobFile(
        `question-sync-request-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(getQuestionSyncPayload(), null, 2),
        'application/json;charset=utf-8'
    );
}

export async function copyQuestionSyncPayload() {
    const payload = JSON.stringify(getQuestionSyncPayload(), null, 2);
    const copied = await copyTextToClipboard(payload);
    if (!copied) {
        throw new Error('无法写入剪贴板');
    }
}

export async function openQuestionSyncIssue() {
    const payload = JSON.stringify(getQuestionSyncPayload(), null, 2);
    const title = encodeURIComponent(`同步题库本地修订与新增题 ${new Date().toISOString().slice(0, 10)}`);
    let bodyText;

    if (payload.length < 6000) {
        bodyText = `请将以下本地题目修订与新增题同步到 questions.js：\n\n\`\`\`json\n${payload}\n\`\`\``;
    } else {
        let copied = false;
        try {
            await copyQuestionSyncPayload();
            copied = true;
        } catch (err) {
            copied = false;
        }
        bodyText = copied
            ? '本地题目修订与新增题较多，已自动复制到剪贴板，请在此粘贴同步申请 JSON 作为 questions.js 更新依据。'
            : '本地题目修订与新增题较多，请先点击“下载同步申请”并将文件内容粘贴或附带在此 Issue 中。';
    }

    openExternalSafe(`https://github.com/ixare/mechanic_design/issues/new?title=${title}&body=${encodeURIComponent(bodyText)}&labels=question-sync`);
}
