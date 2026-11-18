import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { getChapterOrder } from '../js/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const defaultQuestionsPath = path.join(rootDir, 'questions.js');

function loadBankFromCode(code) {
    const sandbox = { window: {} };
    vm.runInNewContext(code, sandbox);
    if (!Array.isArray(sandbox.window.mcq_data) || !Array.isArray(sandbox.window.tf_data)) {
        throw new Error('questions.js 中缺少 mcq_data 或 tf_data 数组');
    }
    return {
        mcq: sandbox.window.mcq_data.map(item => ({ ...item, options: Array.isArray(item.options) ? [...item.options] : undefined })),
        tf: sandbox.window.tf_data.map(item => ({ ...item }))
    };
}

function generateNextQuestionId(list, type, chapter) {
    const order = getChapterOrder(chapter);
    const prefix = Number.isFinite(order) && order < Number.MAX_SAFE_INTEGER
        ? `${type}_ch${String(order).padStart(2, '0')}_`
        : `${type}_custom_`;

    let maxSeq = 0;
    for (const item of list) {
        if (typeof item.id === 'string' && item.id.startsWith(prefix)) {
            const tail = Number(item.id.slice(prefix.length));
            if (Number.isInteger(tail) && tail > maxSeq) {
                maxSeq = tail;
            }
        }
    }
    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

function insertIntoChapter(list, item) {
    let lastSameChapterIdx = -1;
    for (let i = 0; i < list.length; i++) {
        if (list[i].chapter === item.chapter) {
            lastSameChapterIdx = i;
        }
    }
    if (lastSameChapterIdx >= 0) {
        list.splice(lastSameChapterIdx + 1, 0, item);
        return;
    }
    list.push(item);
}

/**
 * 将前端导出的 question-sync-request JSON 合并到 questions.js 源码文本
 */
export function applyQuestionSyncPayload(payload, questionsCode) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('同步申请 payload 必须是合法对象');
    }

    const { mcq, tf } = loadBankFromCode(questionsCode);
    const lookup = new Map();
    mcq.forEach(item => lookup.set(item.id, item));
    tf.forEach(item => lookup.set(item.id, item));

    const changes = Array.isArray(payload.changes)
        ? payload.changes
        : [...(payload.updates || []), ...(payload.additions || [])];

    let appliedUpdates = 0;
    let appliedAdditions = 0;
    const createdIds = [];

    for (const change of changes) {
        if (!change || typeof change !== 'object') continue;
        const updated = change.updated || {};

        if (change.operation === 'update') {
            const target = lookup.get(change.qid);
            if (!target) {
                throw new Error(`未找到待修订题目 id: ${change.qid}`);
            }
            if (typeof updated.question === 'string') target.question = updated.question;
            if (Array.isArray(updated.options)) target.options = [...updated.options];
            if (typeof updated.answer === 'string') target.answer = updated.answer;
            if (typeof updated.explanation === 'string') target.explanation = updated.explanation;
            appliedUpdates++;
            continue;
        }

        if (change.operation === 'add') {
            const type = change.type === 'tf' ? 'tf' : 'mcq';
            const list = type === 'tf' ? tf : mcq;
            const chapter = String(change.chapter || '').trim();
            const newId = generateNextQuestionId(list, type, chapter);

            const entry = {
                id: newId,
                chapter,
                question: String(updated.question || '').trim()
            };
            if (type === 'mcq') {
                entry.options = Array.isArray(updated.options) ? [...updated.options] : [];
            }
            entry.answer = String(updated.answer || '').trim();
            entry.explanation = String(updated.explanation || '').trim();

            insertIntoChapter(list, entry);
            lookup.set(newId, entry);
            createdIds.push(newId);
            appliedAdditions++;
        }
    }

    const nextCode = [
        `const mcq_data = ${JSON.stringify(mcq, null, 4)};`,
        '',
        `const tf_data = ${JSON.stringify(tf, null, 4)};`,
        '',
        'window.mcq_data = mcq_data;',
        'window.tf_data = tf_data;',
        ''
    ].join('\n');

    return {
        code: nextCode,
        appliedUpdates,
        appliedAdditions,
        createdIds,
        mcqCount: mcq.length,
        tfCount: tf.length
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const syncPathArg = process.argv[2];
    if (!syncPathArg) {
        console.error('用法: node scripts/apply-question-sync.mjs <question-sync-request.json> [questions.js路径]');
        process.exit(1);
    }

    const syncFilePath = path.resolve(process.cwd(), syncPathArg);
    const targetQuestionsPath = process.argv[3] ? path.resolve(process.cwd(), process.argv[3]) : defaultQuestionsPath;
    const payload = JSON.parse(fs.readFileSync(syncFilePath, 'utf8'));
    const originalCode = fs.readFileSync(targetQuestionsPath, 'utf8');
    const result = applyQuestionSyncPayload(payload, originalCode);

    fs.writeFileSync(targetQuestionsPath, result.code, 'utf8');
    console.log(`同步完成：更新 ${result.appliedUpdates} 题，新增 ${result.appliedAdditions} 题 (${result.createdIds.join(', ') || '无'})。当前题库共 ${result.mcqCount + result.tfCount} 题。`);
}
