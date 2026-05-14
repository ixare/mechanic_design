import { state } from './state.js';
import { debounce } from './utils.js';

export const FAVORITES_KEY = 'mech_design_quiz_favorites';
export const WRONG_ANSWERS_KEY = 'mech_design_wrong_answers_by_chapter';
export const THEME_KEY = 'mech_design_theme';
export const STATS_KEY = 'mech_design_user_stats';
export const NOTEPAD_KEY = 'mech_design_notepad';
export const WALLPAPER_KEY = 'mech_design_wallpaper';
const DATA_SCHEMA_VERSION = 2;

function normalizeQid(qid) {
    return state.legacy_qid_lookup[qid] || qid;
}

function getQuestionByAnyId(qid) {
    return state.question_lookup[qid] || state.question_lookup[normalizeQid(qid)];
}

function createWrongAnswerRecord(qid, source = 'legacy') {
    const normalizedQid = normalizeQid(qid);
    const now = new Date().toISOString();
    return {
        qid: normalizedQid,
        wrongCount: 1,
        lastWrongAt: now,
        lastPracticedAt: now,
        correctStreak: 0,
        status: 'unmastered',
        source
    };
}

export function getWrongAnswerEntries(chapter = null) {
    const chapters = chapter ? [chapter] : Object.keys(state.wrongAnswersByChapter);
    return chapters.flatMap(chapterName => {
        const records = state.wrongAnswersByChapter[chapterName] || {};
        if (Array.isArray(records)) {
            return records.map(qid => createWrongAnswerRecord(qid));
        }
        return Object.values(records);
    }).filter(record => record && getQuestionByAnyId(record.qid));
}

export function getWrongAnswerQids(chapter = null) {
    return getWrongAnswerEntries(chapter).map(record => record.qid);
}

function normalizeWrongAnswers(rawWrongAnswers) {
    const normalized = {};
    if (!rawWrongAnswers || typeof rawWrongAnswers !== 'object') return normalized;

    Object.entries(rawWrongAnswers).forEach(([chapter, records]) => {
        const chapterRecords = {};
        if (Array.isArray(records)) {
            records.forEach(qid => {
                const record = createWrongAnswerRecord(qid);
                if (getQuestionByAnyId(record.qid)) chapterRecords[record.qid] = record;
            });
        } else if (records && typeof records === 'object') {
            Object.entries(records).forEach(([key, value]) => {
                const rawRecord = typeof value === 'string' ? createWrongAnswerRecord(value) : value;
                if (!rawRecord || typeof rawRecord !== 'object') return;

                const qid = normalizeQid(rawRecord.qid || key);
                if (!getQuestionByAnyId(qid)) return;

                chapterRecords[qid] = {
                    qid,
                    wrongCount: Number(rawRecord.wrongCount) || 1,
                    lastWrongAt: rawRecord.lastWrongAt || new Date().toISOString(),
                    lastPracticedAt: rawRecord.lastPracticedAt || rawRecord.lastWrongAt || new Date().toISOString(),
                    correctStreak: Number(rawRecord.correctStreak) || 0,
                    status: rawRecord.status || 'unmastered',
                    source: rawRecord.source || 'import'
                };
            });
        }
        if (Object.keys(chapterRecords).length > 0) normalized[chapter] = chapterRecords;
    });

    return normalized;
}

export function recordWrongAnswer(question, source = 'quiz') {
    if (!question) return;
    if (!state.wrongAnswersByChapter[question.chapter] || Array.isArray(state.wrongAnswersByChapter[question.chapter])) {
        state.wrongAnswersByChapter[question.chapter] = {};
    }

    const now = new Date().toISOString();
    const existing = state.wrongAnswersByChapter[question.chapter][question.qid];
    state.wrongAnswersByChapter[question.chapter][question.qid] = {
        qid: question.qid,
        wrongCount: existing ? existing.wrongCount + 1 : 1,
        lastWrongAt: now,
        lastPracticedAt: now,
        correctStreak: 0,
        status: 'unmastered',
        source
    };

    saveWrongAnswers();
}

export function recordCorrectPractice(question) {
    if (!question) return;
    const records = state.wrongAnswersByChapter[question.chapter];
    const record = records && records[question.qid];
    if (!record) return;

    record.lastPracticedAt = new Date().toISOString();
    record.correctStreak = (record.correctStreak || 0) + 1;
    record.status = record.correctStreak >= 3 ? 'mastered' : 'reviewing';
    saveWrongAnswers();
}

export function removeWrongAnswerRecord(chapter, qid) {
    const records = state.wrongAnswersByChapter[chapter];
    if (!records) return;
    const normalizedQid = normalizeQid(qid);
    if (Array.isArray(records)) {
        state.wrongAnswersByChapter[chapter] = records.filter(item => normalizeQid(item) !== normalizedQid);
        return;
    }
    delete records[normalizedQid];
}

export function loadWrongAnswers() {
    const stored = localStorage.getItem(WRONG_ANSWERS_KEY);
    try {
        state.wrongAnswersByChapter = normalizeWrongAnswers(stored ? JSON.parse(stored) : {});
        saveWrongAnswers();
    } catch(e) {
        console.error('Failed to parse wrong answers', e);
        state.wrongAnswersByChapter = {};
    }
}

export function saveWrongAnswers() {
    localStorage.setItem(WRONG_ANSWERS_KEY, JSON.stringify(state.wrongAnswersByChapter));
}

export function loadFavorites() {
    const storedFavorites = localStorage.getItem(FAVORITES_KEY);
    try {
        const favorites = storedFavorites ? JSON.parse(storedFavorites) : [];
        state.favorites = [...new Set(favorites.map(normalizeQid).filter(qid => state.question_lookup[qid]))];
        saveFavorites();
    } catch(e) {
        console.error('Failed to parse favorites', e);
        state.favorites = [];
    }
}

export function saveFavorites() {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
}

export function loadStats() {
    const stored = localStorage.getItem(STATS_KEY);
    if (stored) {
        try {
            state.userStats = JSON.parse(stored);
        } catch(e) {
            console.error('Failed to parse user stats', e);
            state.userStats = { total: 0, correct: 0, chapterStats: {} };
        }
    }
    if (!state.userStats || typeof state.userStats !== 'object') {
        state.userStats = { total: 0, correct: 0, chapterStats: {} };
    }
    if (!state.userStats.chapterStats) {
        state.userStats.chapterStats = {};
    }
}

export function saveStats() {
    localStorage.setItem(STATS_KEY, JSON.stringify(state.userStats));
}

export function updateStats(question, isCorrect) {
    state.userStats.total++;
    if (isCorrect) state.userStats.correct++;
    
    if (!state.userStats.chapterStats[question.chapter]) {
        state.userStats.chapterStats[question.chapter] = { total: 0, correct: 0 };
    }
    state.userStats.chapterStats[question.chapter].total++;
    if (isCorrect) state.userStats.chapterStats[question.chapter].correct++;
    
    saveStats();
}

export function loadNotepad() {
    const content = localStorage.getItem(NOTEPAD_KEY);
    if (content) {
        document.getElementById('notepad').value = content;
    }
}

export const saveNotepad = debounce(function() {
    const content = document.getElementById('notepad').value;
    localStorage.setItem(NOTEPAD_KEY, content);
}, 500);

export function exportData() {
    const data = {
        schemaVersion: DATA_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        favorites: state.favorites,
        wrongAnswersByChapter: state.wrongAnswersByChapter,
        userStats: state.userStats,
        notepad: localStorage.getItem(NOTEPAD_KEY) || ''
    };
    const json = JSON.stringify(data);
    const encoded = btoa(unescape(encodeURIComponent(json)));
    document.getElementById('data-area').value = encoded;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `机械设计基础题库备份-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    alert('导出码已生成，并已下载 JSON 备份文件。');
}

export async function copyExportData() {
    const dataArea = document.getElementById('data-area');
    if (!dataArea.value.trim()) {
        exportData();
    }
    try {
        await navigator.clipboard.writeText(dataArea.value);
        alert('导出码已复制到剪贴板。');
    } catch (e) {
        dataArea.select();
        document.execCommand('copy');
        alert('导出码已复制。');
    }
}

export function importDataFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        document.getElementById('data-area').value = String(reader.result || '');
        importData();
    };
    reader.onerror = () => alert('读取备份文件失败，请重新选择。');
    reader.readAsText(file, 'utf-8');
}

export function importData() {
    const code = document.getElementById('data-area').value.trim();
    if (!code) { alert('请输入导出码！'); return; }
    try {
        const json = code.startsWith('{') ? code : decodeURIComponent(escape(atob(code)));
        const data = JSON.parse(json);
        if (Array.isArray(data.favorites) && data.wrongAnswersByChapter && typeof data.wrongAnswersByChapter === 'object') {
            if (!confirm('导入会覆盖当前收藏、错题、统计和笔记。确定继续吗？')) return;

            state.favorites = [...new Set(data.favorites.map(normalizeQid).filter(qid => state.question_lookup[qid]))];
            state.wrongAnswersByChapter = normalizeWrongAnswers(data.wrongAnswersByChapter);
            if (data.userStats && typeof data.userStats === 'object') {
                state.userStats = {
                    total: Number(data.userStats.total) || 0,
                    correct: Number(data.userStats.correct) || 0,
                    chapterStats: data.userStats.chapterStats || {}
                };
            }
            localStorage.setItem(NOTEPAD_KEY, typeof data.notepad === 'string' ? data.notepad : '');
            saveFavorites();
            saveWrongAnswers();
            saveStats();
            const wrongCount = getWrongAnswerQids().length;
            alert(`数据恢复成功！已导入 ${state.favorites.length} 条收藏、${wrongCount} 道错题。页面即将刷新。`);
            location.reload();
        } else {
            throw new Error('无效的数据格式');
        }
    } catch (e) {
        alert('导入失败：无效的导出码。');
        console.error(e);
    }
}

export function changeTheme(isDark) {
    if (isDark) {
        document.body.classList.add('dark-mode');
        localStorage.setItem(THEME_KEY, 'dark');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem(THEME_KEY, 'light');
    }
}
