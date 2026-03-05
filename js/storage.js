import { state } from './state.js';
import { debounce } from './utils.js';

export const FAVORITES_KEY = 'mech_design_quiz_favorites';
export const WRONG_ANSWERS_KEY = 'mech_design_wrong_answers_by_chapter';
export const THEME_KEY = 'mech_design_theme';
export const STATS_KEY = 'mech_design_user_stats';
export const NOTEPAD_KEY = 'mech_design_notepad';
export const WALLPAPER_KEY = 'mech_design_wallpaper';

export function loadWrongAnswers() {
    const stored = localStorage.getItem(WRONG_ANSWERS_KEY);
    try {
        state.wrongAnswersByChapter = stored ? JSON.parse(stored) : {};
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
        state.favorites = storedFavorites ? JSON.parse(storedFavorites) : [];
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
        favorites: state.favorites,
        wrongAnswersByChapter: state.wrongAnswersByChapter,
        userStats: state.userStats,
        notepad: localStorage.getItem(NOTEPAD_KEY) || ''
    };
    const json = JSON.stringify(data);
    const encoded = btoa(unescape(encodeURIComponent(json)));
    document.getElementById('data-area').value = encoded;
    alert('导出码已生成，请复制下方的代码保存。');
}

export function importData() {
    const code = document.getElementById('data-area').value.trim();
    if (!code) { alert('请输入导出码！'); return; }
    try {
        const json = decodeURIComponent(escape(atob(code)));
        const data = JSON.parse(json);
        if (data.favorites && data.wrongAnswersByChapter) {
            state.favorites = data.favorites;
            state.wrongAnswersByChapter = data.wrongAnswersByChapter;
            if (data.userStats) state.userStats = data.userStats;
            if (data.notepad) {
                localStorage.setItem(NOTEPAD_KEY, data.notepad);
            }
            saveFavorites();
            saveWrongAnswers();
            saveStats();
            alert('数据恢复成功！页面即将刷新。');
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
