import { state } from './state.js';
import {
    copyTextToClipboard,
    debounce,
    downloadBlobFile,
    safeStorageSet,
    safeStorageRemove,
    showToast
} from './utils.js';
import { confirmDialog } from './modal.js';
import { QUESTION_ADDITIONS_KEY, QUESTION_EDITS_KEY, loadQuestionEdits } from './questionEdits.js';
import { LEGACY_WALLPAPER_KEY } from './wallpaperStore.js';

export const FAVORITES_KEY = 'mech_design_quiz_favorites';
export const WRONG_ANSWERS_KEY = 'mech_design_wrong_answers_by_chapter';
export const THEME_KEY = 'mech_design_theme';
export const STATS_KEY = 'mech_design_user_stats';
export const NOTEPAD_KEY = 'mech_design_notepad';
export const PRACTICE_TRACK_KEY = 'mech_design_practice_track';
export const FONT_SCALE_KEY = 'mech_design_font_scale';
export const SIDEBAR_COLLAPSED_KEY = 'mech_design_sidebar_collapsed';
export const LAST_STUDY_KEY = 'mech_design_last_study';
export const WALLPAPER_KEY = LEGACY_WALLPAPER_KEY;
const DATA_SCHEMA_VERSION = 3;

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

function matchesWrongStatus(record, statusFilter = 'all') {
    if (!record) return false;
    if (!statusFilter || statusFilter === 'all') return true;
    if (statusFilter === 'pending') return record.status !== 'mastered';
    return record.status === statusFilter;
}

/**
 * 获取错题详情记录列表，支持按章节与掌握状态过滤
 */
export function getWrongAnswerEntries(chapter = null, options = {}) {
    const statusFilter = options.status || 'all';
    const chapters = chapter ? [chapter] : Object.keys(state.wrongAnswersByChapter);
    return chapters.flatMap(chapterName => {
        const records = state.wrongAnswersByChapter[chapterName] || {};
        if (Array.isArray(records)) {
            return records.map(qid => createWrongAnswerRecord(qid));
        }
        return Object.values(records);
    }).filter(record => record && getQuestionByAnyId(record.qid) && matchesWrongStatus(record, statusFilter));
}

export function getWrongAnswerQids(chapter = null, options = {}) {
    return getWrongAnswerEntries(chapter, options).map(record => record.qid);
}

function normalizeWrongAnswers(rawWrongAnswers) {
    const normalized = {};
    if (!rawWrongAnswers || typeof rawWrongAnswers !== 'object' || Array.isArray(rawWrongAnswers)) {
        return normalized;
    }

    Object.entries(rawWrongAnswers).forEach(([chapter, records]) => {
        if (Array.isArray(records)) {
            records.forEach(qid => {
                const record = createWrongAnswerRecord(qid);
                const question = getQuestionByAnyId(record.qid);
                if (!question) return;
                const bucketChapter = question.chapter || chapter;
                if (!normalized[bucketChapter]) normalized[bucketChapter] = {};
                normalized[bucketChapter][record.qid] = record;
            });
            return;
        }

        if (records && typeof records === 'object') {
            Object.entries(records).forEach(([key, value]) => {
                const rawRecord = typeof value === 'string' ? createWrongAnswerRecord(value) : value;
                if (!rawRecord || typeof rawRecord !== 'object') return;

                const qid = normalizeQid(rawRecord.qid || key);
                const question = getQuestionByAnyId(qid);
                if (!question) return;

                const bucketChapter = question.chapter || chapter;
                if (!normalized[bucketChapter]) normalized[bucketChapter] = {};

                normalized[bucketChapter][qid] = {
                    qid,
                    wrongCount: Math.max(1, Number(rawRecord.wrongCount) || 1),
                    lastWrongAt: rawRecord.lastWrongAt || new Date().toISOString(),
                    lastPracticedAt: rawRecord.lastPracticedAt || rawRecord.lastWrongAt || new Date().toISOString(),
                    correctStreak: Math.max(0, Number(rawRecord.correctStreak) || 0),
                    status: ['unmastered', 'reviewing', 'mastered'].includes(rawRecord.status) ? rawRecord.status : 'unmastered',
                    source: rawRecord.source || 'import'
                };
            });
        }
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
        const next = records.filter(item => normalizeQid(item) !== normalizedQid);
        if (next.length === 0) {
            delete state.wrongAnswersByChapter[chapter];
        } else {
            state.wrongAnswersByChapter[chapter] = next;
        }
        return;
    }
    delete records[normalizedQid];
    if (Object.keys(records).length === 0) {
        delete state.wrongAnswersByChapter[chapter];
    }
}

export function loadWrongAnswers() {
    const stored = localStorage.getItem(WRONG_ANSWERS_KEY);
    try {
        state.wrongAnswersByChapter = normalizeWrongAnswers(stored ? JSON.parse(stored) : {});
        saveWrongAnswers();
    } catch (e) {
        console.error('Failed to parse wrong answers', e);
        state.wrongAnswersByChapter = {};
    }
}

export function saveWrongAnswers() {
    safeStorageSet(WRONG_ANSWERS_KEY, JSON.stringify(state.wrongAnswersByChapter));
}

export function loadFavorites() {
    const storedFavorites = localStorage.getItem(FAVORITES_KEY);
    try {
        const favorites = storedFavorites ? JSON.parse(storedFavorites) : [];
        state.favorites = [...new Set(
            (Array.isArray(favorites) ? favorites : [])
                .map(normalizeQid)
                .filter(qid => state.question_lookup[qid])
        )];
        saveFavorites();
    } catch (e) {
        console.error('Failed to parse favorites', e);
        state.favorites = [];
    }
}

export function saveFavorites() {
    safeStorageSet(FAVORITES_KEY, JSON.stringify(state.favorites));
}

function normalizePracticedList(list) {
    if (!Array.isArray(list)) return [];
    return [...new Set(list.map(normalizeQid).filter(qid => state.question_lookup[qid]))];
}

function normalizeUserStats(raw) {
    const base = { total: 0, correct: 0, practicedQids: [], chapterStats: {} };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

    base.total = Math.max(0, Number(raw.total) || 0);
    base.correct = Math.max(0, Number(raw.correct) || 0);
    base.practicedQids = normalizePracticedList(raw.practicedQids);

    if (raw.chapterStats && typeof raw.chapterStats === 'object' && !Array.isArray(raw.chapterStats)) {
        Object.entries(raw.chapterStats).forEach(([chapter, entry]) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
            const practiced = normalizePracticedList(entry.practicedQids);
            base.chapterStats[chapter] = {
                total: Math.max(0, Number(entry.total) || 0),
                correct: Math.max(0, Number(entry.correct) || 0),
                practicedQids: practiced
            };
        });
    }

    // 从章节统计补齐全局已练去重集合
    const mergedGlobal = new Set(base.practicedQids);
    Object.values(base.chapterStats).forEach(entry => {
        entry.practicedQids.forEach(qid => mergedGlobal.add(qid));
    });
    base.practicedQids = [...mergedGlobal];
    return base;
}

export function loadStats() {
    const stored = localStorage.getItem(STATS_KEY);
    try {
        state.userStats = normalizeUserStats(stored ? JSON.parse(stored) : null);
    } catch (e) {
        console.error('Failed to parse user stats', e);
        state.userStats = normalizeUserStats(null);
    }
}

export function saveStats() {
    safeStorageSet(STATS_KEY, JSON.stringify(state.userStats));
}

export function updateStats(question, isCorrect) {
    if (!question) return;
    if (!Array.isArray(state.userStats.practicedQids)) {
        state.userStats.practicedQids = [];
    }
    state.userStats.total++;
    if (isCorrect) state.userStats.correct++;
    if (question.qid && !state.userStats.practicedQids.includes(question.qid)) {
        state.userStats.practicedQids.push(question.qid);
    }

    if (!state.userStats.chapterStats[question.chapter]) {
        state.userStats.chapterStats[question.chapter] = { total: 0, correct: 0, practicedQids: [] };
    }
    const chapterEntry = state.userStats.chapterStats[question.chapter];
    if (!Array.isArray(chapterEntry.practicedQids)) {
        chapterEntry.practicedQids = [];
    }
    chapterEntry.total++;
    if (isCorrect) chapterEntry.correct++;
    if (question.qid && !chapterEntry.practicedQids.includes(question.qid)) {
        chapterEntry.practicedQids.push(question.qid);
    }

    saveStats();
}

export function getTotalPracticedCount() {
    return Array.isArray(state.userStats.practicedQids) ? state.userStats.practicedQids.length : 0;
}

export function getChapterPracticedCount(chapter) {
    const entry = state.userStats.chapterStats?.[chapter];
    if (!entry) return 0;
    return Array.isArray(entry.practicedQids) ? entry.practicedQids.length : 0;
}

export function loadPracticeSettings() {
    const stored = localStorage.getItem(PRACTICE_TRACK_KEY);
    state.practiceTrackProgress = stored === null ? true : stored === 'true';
}

export function setPracticeTrackProgress(enabled) {
    state.practiceTrackProgress = Boolean(enabled);
    safeStorageSet(PRACTICE_TRACK_KEY, String(state.practiceTrackProgress));
}

export function loadNotepad() {
    const notepadEl = document.getElementById('notepad');
    if (!notepadEl) return;
    const content = localStorage.getItem(NOTEPAD_KEY);
    if (content) {
        notepadEl.value = content;
    }
}

export const saveNotepad = debounce(function () {
    const notepadEl = document.getElementById('notepad');
    if (!notepadEl) return;
    safeStorageSet(NOTEPAD_KEY, notepadEl.value);
}, 500);

export function encodeBackupPayload(data) {
    const json = JSON.stringify(data);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export function decodeBackupPayload(code) {
    const trimmed = String(code ?? '').trim();
    if (!trimmed) throw new Error('空的导出码');
    const json = trimmed.startsWith('{')
        ? trimmed
        : (() => {
            const binary = atob(trimmed);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return new TextDecoder('utf-8').decode(bytes);
        })();
    return JSON.parse(json);
}

export function buildExportData() {
    return {
        schemaVersion: DATA_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        favorites: state.favorites,
        wrongAnswersByChapter: state.wrongAnswersByChapter,
        userStats: state.userStats,
        notepad: localStorage.getItem(NOTEPAD_KEY) || '',
        questionEdits: state.questionEdits,
        questionAdditions: state.questionAdditions
    };
}

export function exportData() {
    const data = buildExportData();
    const encoded = encodeBackupPayload(data);
    const dataArea = document.getElementById('data-area');
    if (dataArea) {
        dataArea.value = encoded;
    }
    downloadBlobFile(
        `机械设计基础题库备份-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(data, null, 2),
        'application/json;charset=utf-8'
    );
    showToast('导出码已生成，并已下载 JSON 备份文件。', 'success');
}

export async function copyExportData() {
    const dataArea = document.getElementById('data-area');
    if (!dataArea) return;
    if (!dataArea.value.trim()) {
        dataArea.value = encodeBackupPayload(buildExportData());
    }
    const copied = await copyTextToClipboard(dataArea.value, dataArea);
    if (copied) {
        showToast('导出码已复制到剪贴板。', 'success');
    } else {
        showToast('复制失败，请手动选中文本框内容复制。', 'error');
    }
}

export function importDataFile(file, onImported = null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const dataArea = document.getElementById('data-area');
        if (dataArea) {
            dataArea.value = String(reader.result || '');
        }
        importData(null, { onImported });
    };
    reader.onerror = () => showToast('读取备份文件失败，请重新选择。', 'error');
    reader.readAsText(file, 'utf-8');
}

/**
 * 导入学习数据备份：先恢复本地新增与修订题目，再恢复收藏/错题/统计，防止新增题关联记录丢失
 */
export async function importData(rawCode = null, options = {}) {
    const dataArea = typeof document !== 'undefined' ? document.getElementById('data-area') : null;
    const code = String(rawCode ?? dataArea?.value ?? '').trim();
    if (!code) {
        showToast('请先输入导出码或选择备份文件！', 'warning');
        return { ok: false, reason: 'empty' };
    }

    let data;
    try {
        data = decodeBackupPayload(code);
        if (!Array.isArray(data?.favorites) || !data?.wrongAnswersByChapter || typeof data.wrongAnswersByChapter !== 'object') {
            throw new Error('无效的数据格式');
        }
    } catch (e) {
        showToast('导入失败：无效的导出码或 JSON 格式。', 'error');
        console.error(e);
        return { ok: false, reason: 'invalid' };
    }

    if (!options.skipConfirm) {
        const confirmed = await confirmDialog({
            title: '恢复备份数据',
            message: '导入会覆盖当前收藏、错题、统计、笔记以及本地题目修订记录。确定继续吗？',
            confirmText: '确认恢复',
            danger: true
        });
        if (!confirmed) return { ok: false, reason: 'cancelled' };
    }

    // 1. 先恢复并注册本地题目新增与修订，保证新增题 qid 进入 state.question_lookup
    if (data.questionEdits && typeof data.questionEdits === 'object' && !Array.isArray(data.questionEdits)) {
        safeStorageSet(QUESTION_EDITS_KEY, JSON.stringify(data.questionEdits));
    } else {
        safeStorageRemove(QUESTION_EDITS_KEY);
    }
    if (data.questionAdditions && typeof data.questionAdditions === 'object' && !Array.isArray(data.questionAdditions)) {
        safeStorageSet(QUESTION_ADDITIONS_KEY, JSON.stringify(data.questionAdditions));
    } else {
        safeStorageRemove(QUESTION_ADDITIONS_KEY);
    }
    loadQuestionEdits();

    // 2. 再归一化并校验收藏、错题、统计与随手记
    state.favorites = [...new Set(data.favorites.map(normalizeQid).filter(qid => state.question_lookup[qid]))];
    state.wrongAnswersByChapter = normalizeWrongAnswers(data.wrongAnswersByChapter);
    state.userStats = normalizeUserStats(data.userStats);

    const notepadText = typeof data.notepad === 'string' ? data.notepad : '';
    safeStorageSet(NOTEPAD_KEY, notepadText);
    const notepadEl = typeof document !== 'undefined' ? document.getElementById('notepad') : null;
    if (notepadEl) {
        notepadEl.value = notepadText;
    }

    saveFavorites();
    saveWrongAnswers();
    saveStats();

    const wrongCount = getWrongAnswerQids().length;
    showToast(`数据恢复成功：已导入 ${state.favorites.length} 条收藏、${wrongCount} 道错题。`, 'success', 4000);

    if (typeof options.onImported === 'function') {
        options.onImported();
    }

    return {
        ok: true,
        favoritesCount: state.favorites.length,
        wrongCount
    };
}

export function changeTheme(isDark) {
    if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark-mode', Boolean(isDark));
        document.body.classList.toggle('dark-mode', Boolean(isDark));
    }
    safeStorageSet(THEME_KEY, isDark ? 'dark' : 'light');
}

const VALID_FONT_SCALES = new Set(['standard', 'large', 'xlarge']);

/**
 * 读取并应用界面正文字号档位
 */
export function loadFontScale() {
    const raw = localStorage.getItem(FONT_SCALE_KEY);
    const scale = VALID_FONT_SCALES.has(raw) ? raw : 'standard';
    if (typeof document !== 'undefined') {
        document.documentElement.dataset.fontScale = scale;
    }
    return scale;
}

/**
 * 保存并切换界面正文字号档位
 */
export function setFontScale(scale) {
    const next = VALID_FONT_SCALES.has(scale) ? scale : 'standard';
    if (typeof document !== 'undefined') {
        document.documentElement.dataset.fontScale = next;
    }
    safeStorageSet(FONT_SCALE_KEY, next);
    return next;
}

/**
 * 读取并应用桌面端侧栏折叠状态
 */
export function loadSidebarPreference() {
    const collapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.toggle('sidebar-collapsed', collapsed);
    }
    return collapsed;
}

export function setSidebarCollapsed(collapsed) {
    const next = Boolean(collapsed);
    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.toggle('sidebar-collapsed', next);
    }
    safeStorageSet(SIDEBAR_COLLAPSED_KEY, String(next));
    return next;
}

export function getLastStudyLocation() {
    try {
        const raw = localStorage.getItem(LAST_STUDY_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.chapter !== 'string' || !['mcq', 'tf'].includes(parsed.type)) {
            return null;
        }
        return parsed;
    } catch (err) {
        return null;
    }
}

export function saveLastStudyLocation(chapter, type) {
    if (!chapter || !['mcq', 'tf'].includes(type)) return;
    safeStorageSet(LAST_STUDY_KEY, JSON.stringify({ chapter, type }));
}
