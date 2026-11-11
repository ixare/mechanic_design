import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { validateQuestionBank } from '../scripts/validate-questions.mjs';

function createMemoryStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(String(key), String(value));
        },
        removeItem(key) {
            store.delete(String(key));
        },
        clear() {
            store.clear();
        }
    };
}

globalThis.localStorage = createMemoryStorage();

const {
    formatInlineHtml,
    renderMarkdown,
    parseMcqOption,
    getChapterOrder,
    replaceBlankPlaceholders,
    safeStorageSet
} = await import('../js/utils.js');
const {
    state,
    computeLegacyTextQuestionId,
    processData
} = await import('../js/state.js');
const {
    normalizeQuestionAnswer,
    loadQuestionEdits,
    saveQuestionEdit,
    discardQuestionEdit,
    saveQuestionAddition,
    discardQuestionAddition
} = await import('../js/questionEdits.js');
const {
    loadFavorites,
    loadWrongAnswers,
    recordWrongAnswer,
    recordCorrectPractice,
    removeWrongAnswerRecord,
    getWrongAnswerQids,
    loadStats,
    updateStats,
    getTotalPracticedCount,
    getChapterPracticedCount,
    loadFontScale,
    setFontScale,
    loadSidebarPreference,
    setSidebarCollapsed,
    getLastStudyLocation,
    saveLastStudyLocation,
    encodeBackupPayload,
    decodeBackupPayload,
    importData
} = await import('../js/storage.js');
const { shuffleQuestions } = await import('../js/quiz.js');

function resetQuestionBank() {
    globalThis.localStorage.clear();
    state.favorites = [];
    state.wrongAnswersByChapter = {};
    state.userStats = { total: 0, correct: 0, practicedQids: [], chapterStats: {} };
    state.questionEdits = {};
    state.questionAdditions = {};

    const sampleMcq = [
        {
            id: 'mcq_ch01_001',
            chapter: '第一章 绪论',
            question: '1. 传动过程中机构自锁的条件是()$α<φ$以及（）？',
            options: ['A．机械效率大于零', 'b. 驱动力处于摩擦圆内', ' C  等效阻力为零', 'D．转速为零'],
            answer: 'B',
            explanation: '当 $d_2 - 2(h_a^*+c^*)m$ 满足条件时发生自锁，*重点*记住。'
        },
        {
            id: 'mcq_ch10_001',
            chapter: '第十章 齿轮传动',
            question: '2. 标准直齿圆柱齿轮的分度圆直径公式为（）',
            options: ['A．mz', 'B．2mz', 'C．m(z+2)', 'D．m(z-2)'],
            answer: 'A',
            explanation: '分度圆直径 $d = m z$。'
        }
    ];
    const sampleTf = [
        {
            id: 'tf_ch01_001',
            chapter: '第一章 绪论',
            question: '1. 平面机构的自由度必定大于零。',
            answer: '×',
            explanation: '静定桁架自由度为零。'
        }
    ];
    processData({ mcq: sampleMcq, tf: sampleTf });
}

test('formatInlineHtml preserves math inequalities, escapes XSS, and highlights outside math only', () => {
    const formatted = formatInlineHtml(
        '齿轮自锁条件为 $α<φ$ ，防注入 <script>alert(1)</script> （）',
        ['齿轮', 'α']
    );
    assert.ok(formatted.includes('<mark class="search-highlight">齿轮</mark>'));
    assert.ok(formatted.includes('$α&lt;φ$'), 'Math comparison < must be entity-escaped so browser will not swallow tag');
    assert.ok(!formatted.includes('<mark class="search-highlight">α</mark>'), 'Search highlight must not mutate tokens inside $...$ math');
    assert.ok(formatted.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(formatted.includes('(   )'));
});

test('renderMarkdown shields math delimiters from marked formatting and preserves math symbols', () => {
    const originalMarked = globalThis.marked;
    const originalPurify = globalThis.DOMPurify;
    try {
        globalThis.marked = {
            parse(input) {
                return `<p>${input.replace(/\*([^*]+)\*/g, '<em>$1</em>')}</p>`;
            }
        };
        globalThis.DOMPurify = {
            sanitize(html) {
                return html;
            }
        };

        const rendered = renderMarkdown('重点记住 *标准公式*：$d_2 - 2(h_a^*+c^*)m$ 且 $α<φ$');
        assert.ok(rendered.includes('<em>标准公式</em>'));
        assert.ok(rendered.includes('$d_2 - 2(h_a^*+c^*)m$'), 'Asterisks inside math must not become <em> tags');
        assert.ok(rendered.includes('$α&lt;φ$'));
    } finally {
        globalThis.marked = originalMarked;
        globalThis.DOMPurify = originalPurify;
    }
});

test('parseMcqOption, replaceBlankPlaceholders, and getChapterOrder handle formatting edge cases', () => {
    assert.deepEqual(parseMcqOption('A．机械效率大于零'), { key: 'A', text: '机械效率大于零' });
    assert.deepEqual(parseMcqOption('  b. 驱动力处于摩擦圆内  '), { key: 'B', text: '驱动力处于摩擦圆内' });
    assert.deepEqual(parseMcqOption('C   只有文本'), { key: 'C', text: '只有文本' });
    assert.deepEqual(parseMcqOption('D：完整冒号'), { key: 'D', text: '完整冒号' });
    assert.deepEqual(parseMcqOption('无前缀选项'), { key: '', text: '无前缀选项' });
    assert.equal(replaceBlankPlaceholders('第一空()与第二空（）'), '第一空 (   ) 与第二空 (   ) ');
    assert.equal(getChapterOrder('第一章 绪论'), 1);
    assert.equal(getChapterOrder('第十章 齿轮传动'), 10);
    assert.equal(getChapterOrder('第十四章 联轴器'), 14);
    assert.equal(getChapterOrder('未编号附录'), Number.MAX_SAFE_INTEGER);
});

test('processData registers canonical IDs, legacy lookup keys, and cached _searchText', () => {
    resetQuestionBank();
    const q1 = state.question_lookup['mcq_ch01_001'];
    assert.ok(q1);
    assert.equal(q1.legacyQid, 'mcq_0');
    assert.equal(state.legacy_qid_lookup['mcq_0'], 'mcq_ch01_001');

    const legacyHash = computeLegacyTextQuestionId(q1, 'mcq');
    assert.equal(state.legacy_qid_lookup[legacyHash], 'mcq_ch01_001');
    assert.equal(state.question_lookup[legacyHash], q1);
    assert.ok(q1._searchText.includes('机械效率大于零'));
});

test('questionEdits normalizes answers, saves/discards edits & additions, and migrates legacy text-hash keys', () => {
    resetQuestionBank();

    assert.equal(normalizeQuestionAnswer('tf', 'T'), '✓');
    assert.equal(normalizeQuestionAnswer('tf', '对'), '✓');
    assert.equal(normalizeQuestionAnswer('tf', 'F'), '×');
    assert.equal(normalizeQuestionAnswer('tf', 'x'), '×');
    assert.throws(() => normalizeQuestionAnswer('tf', 'maybe'));

    assert.equal(normalizeQuestionAnswer('mcq', 'a', ['A．一', 'B．二']), 'A');
    assert.throws(() => normalizeQuestionAnswer('mcq', 'C', ['A．一', 'B．二']));

    const origQuestion = state.question_lookup['mcq_ch01_001'];
    const legacyHash = computeLegacyTextQuestionId(origQuestion, 'mcq');
    localStorage.setItem('mech_design_question_edits', JSON.stringify({
        [legacyHash]: {
            question: '修订后的题目内容',
            options: ['A．一', 'B．二'],
            answer: 'A',
            explanation: '修订解析'
        }
    }));

    loadQuestionEdits();
    assert.equal(origQuestion.question, '修订后的题目内容');
    assert.equal(state.questionEdits['mcq_ch01_001']?.answer, 'A');

    discardQuestionEdit('mcq_ch01_001');
    assert.equal(origQuestion.answer, 'B');

    saveQuestionEdit('tf_ch01_001', {
        question: '1. 修订判断题',
        answer: 'true',
        explanation: '补充解析'
    });
    assert.equal(state.question_lookup['tf_ch01_001'].answer, '✓');

    const addedQid = saveQuestionAddition({
        chapter: '第十五章 新增测试',
        type: 'mcq',
        question: '新增一题',
        optionsText: 'A．甲\nB．乙',
        answer: 'b',
        explanation: '解析内容'
    });
    assert.ok(state.question_lookup[addedQid]);
    assert.equal(state.question_lookup[addedQid].answer, 'B');

    assert.equal(discardQuestionAddition(addedQid), true);
    assert.equal(state.question_lookup[addedQid], undefined);
});

test('storage tracks deduplicated practiced questions, 3-streak wrong mastery, and safe UTF-8 backup roundtrip', () => {
    resetQuestionBank();
    const q1 = state.question_lookup['mcq_ch01_001'];
    const q2 = state.question_lookup['tf_ch01_001'];

    updateStats(q1, false);
    updateStats(q1, true);
    updateStats(q2, true);
    assert.equal(state.userStats.total, 3);
    assert.equal(state.userStats.correct, 2);
    assert.equal(getTotalPracticedCount(), 2, 'Unique practiced count deduplicates repeated attempts on q1');
    assert.equal(getChapterPracticedCount('第一章 绪论'), 2);

    recordWrongAnswer(q1, '单元测试');
    assert.deepEqual(getWrongAnswerQids('第一章 绪论', { status: 'pending' }), ['mcq_ch01_001']);
    recordCorrectPractice(q1);
    assert.equal(state.wrongAnswersByChapter['第一章 绪论']['mcq_ch01_001'].status, 'reviewing');
    recordCorrectPractice(q1);
    recordCorrectPractice(q1);
    assert.equal(state.wrongAnswersByChapter['第一章 绪论']['mcq_ch01_001'].status, 'mastered');
    assert.deepEqual(getWrongAnswerQids('第一章 绪论', { status: 'pending' }), []);
    assert.deepEqual(getWrongAnswerQids('第一章 绪论', { status: 'all' }), ['mcq_ch01_001']);

    removeWrongAnswerRecord('第一章 绪论', 'mcq_ch01_001');
    assert.equal(state.wrongAnswersByChapter['第一章 绪论'], undefined, 'Empty chapter bucket must be deleted');

    const payload = { hello: '机械设计 ✓ × $α<φ$', favorites: ['mcq_ch01_001'] };
    const encoded = encodeBackupPayload(payload);
    assert.deepEqual(decodeBackupPayload(encoded), payload);
});

test('importData loads questionAdditions before filtering favorites and migrates legacy IDs', async () => {
    resetQuestionBank();
    const q1 = state.question_lookup['mcq_ch01_001'];
    const legacyHash = computeLegacyTextQuestionId(q1, 'mcq');

    const backup = {
        favorites: ['local_custom_001', legacyHash],
        wrongAnswersByChapter: {
            '自定义章': {
                local_custom_001: { qid: 'local_custom_001', wrongCount: 2, correctStreak: 1, status: 'reviewing' }
            }
        },
        userStats: {
            total: 4,
            correct: 2,
            practicedQids: ['local_custom_001', 'mcq_0']
        },
        questionAdditions: {
            local_custom_001: {
                chapter: '自定义章',
                type: 'tf',
                question: '本地备份新增题',
                answer: '✓',
                explanation: '备份恢复测试'
            }
        },
        questionEdits: {},
        notepad: '备忘笔记 ✓'
    };

    const encoded = encodeBackupPayload(backup);
    const result = await importData(encoded, { skipConfirm: true });
    assert.equal(result.ok, true);
    assert.ok(state.question_lookup['local_custom_001'], 'Local addition must be registered during import');
    assert.deepEqual(state.favorites.sort(), ['local_custom_001', 'mcq_ch01_001'].sort());
    assert.deepEqual(getWrongAnswerQids('自定义章'), ['local_custom_001']);
    assert.equal(getTotalPracticedCount(), 2);
});

test('loadFavorites and loadWrongAnswers migrate legacy index QIDs from pre-ID storage', () => {
    resetQuestionBank();
    localStorage.setItem('mech_design_quiz_favorites', JSON.stringify(['mcq_0', 'tf_0', 'nonexistent']));
    localStorage.setItem('mech_design_wrong_answers_by_chapter', JSON.stringify({
        '第一章 绪论': ['tf_0']
    }));

    loadFavorites();
    loadWrongAnswers();
    loadStats();

    assert.deepEqual(state.favorites, ['mcq_ch01_001', 'tf_ch01_001']);
    assert.deepEqual(getWrongAnswerQids('第一章 绪论'), ['tf_ch01_001']);
});

test('safeStorageSet returns false without throwing on QuotaExceededError', () => {
    const origSetItem = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = () => {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
    };
    try {
        assert.equal(safeStorageSet('test_quota_key', 'value'), false);
    } finally {
        globalThis.localStorage.setItem = origSetItem;
    }
});

test('shuffleQuestions returns a permutation without mutating input array', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const snapshot = [...input];
    const seenOrders = new Set();
    for (let i = 0; i < 20; i++) {
        const shuffled = shuffleQuestions(input);
        assert.deepEqual(input, snapshot);
        assert.deepEqual([...shuffled].sort((a, b) => a - b), input);
        seenOrders.add(shuffled.join(','));
    }
    assert.ok(seenOrders.size > 1, 'Fisher-Yates shuffle should generate distinct permutations');
});

test('real questions.js passes validator and loads cleanly via processData with all option keys resolved', () => {
    resetQuestionBank();
    const validation = validateQuestionBank();
    assert.equal(validation.ok, true, validation.errors.join('\n'));
    assert.equal(validation.stats.mcqCount, 222);
    assert.equal(validation.stats.tfCount, 241);

    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(new URL('../questions.js', import.meta.url), 'utf8'), sandbox);
    processData({ mcq: sandbox.window.mcq_data, tf: sandbox.window.tf_data });

    const mcqList = globalThis.mcq_data;
    const tfList = globalThis.tf_data;
    assert.equal(mcqList.length, 222);
    assert.equal(tfList.length, 241);
    assert.equal(Object.keys(state.all_data).length, 14);

    for (const q of mcqList) {
        const keys = q.options.map(opt => parseMcqOption(opt).key);
        assert.ok(keys.every(Boolean), `Missing option key in ${q.id}`);
        assert.ok(keys.includes(q.answer), `Answer ${q.answer} missing from parsed keys in ${q.id}`);
        const stemHtml = formatInlineHtml(q.question);
        assert.ok(!stemHtml.includes('<φ'), `Unescaped comparison in ${q.id}`);
    }
});

test('UI preferences persist valid font scale, sidebar state, and last study location', () => {
    resetQuestionBank();
    assert.equal(loadFontScale(), 'standard');
    assert.equal(setFontScale('large'), 'large');
    assert.equal(loadFontScale(), 'large');
    assert.equal(setFontScale('xlarge'), 'xlarge');
    assert.equal(setFontScale('bogus'), 'standard');

    assert.equal(loadSidebarPreference(), false);
    assert.equal(setSidebarCollapsed(true), true);
    assert.equal(loadSidebarPreference(), true);

    assert.equal(getLastStudyLocation(), null);
    saveLastStudyLocation('第一章 绪论', 'mcq');
    assert.deepEqual(getLastStudyLocation(), { chapter: '第一章 绪论', type: 'mcq' });
    saveLastStudyLocation('第一章 绪论', 'invalid');
    assert.deepEqual(getLastStudyLocation(), { chapter: '第一章 绪论', type: 'mcq' });
});
