import { state, processData } from './js/state.js';
import { safeStorageRemove, showToast } from './js/utils.js';
import { initIcons } from './js/icons.js';
import { closeModal, confirmDialog, configureModal, isAnyModalOpen, isModalOpen, openModal } from './js/modal.js';
import { loadQuestionEdits } from './js/questionEdits.js';
import {
    changeTheme,
    copyExportData,
    exportData,
    importData,
    importDataFile,
    loadFavorites,
    loadFontScale,
    loadNotepad,
    loadPracticeSettings,
    loadSidebarPreference,
    loadStats,
    loadWrongAnswers,
    NOTEPAD_KEY,
    saveNotepad,
    setFontScale,
    THEME_KEY
} from './js/storage.js';
import { showDashboard, closeDashboard } from './js/dashboard.js';
import { closeCropper, confirmCrop, handleWallpaperUpload, initWallpaper, triggerWallpaperUpload } from './js/wallpaper.js';
import { setupFeedbackHandlers, showFeedbackModal } from './js/feedback.js';
import {
    clearAllWrongAnswers,
    clearCurrentChapterWrongAnswers,
    closeChapterDrawer,
    closeDataSync,
    closeSearchModal,
    createNavigationAndContent,
    downloadNotepadTxt,
    jumpToQuestion,
    openSearchModal,
    refreshQuestionChangeViews,
    removeSingleWrongAnswer,
    selectPracticeOption,
    setQuestionIndexView,
    setupBackToTopButton,
    setupMobileMenu,
    setupSearchFilters,
    setupStickyChromeBehavior,
    showAllFavorites,
    showAllWrongAnswers,
    showChapterWrongAnswers,
    showDataSync,
    showHome,
    showQuestions,
    syncDesktopSidebarButton,
    syncFontScaleButtons,
    toggleAllAnswers,
    toggleChapterDrawer,
    toggleDesktopSidebar,
    toggleFavorite,
    toggleFavoritesView,
    togglePendingWrongView,
    togglePracticeTrackProgress,
    toggleQuestionIndexCollapse,
    toggleRightSidebar,
    toggleSingleAnswer,
    updateChapterNavStatus
} from './js/ui.js';
import {
    closeQuestionEditManager,
    closeQuestionEditModal,
    closeQuestionEntryModal,
    copyQuestionSyncRequest,
    discardCurrentQuestionEdit,
    discardQuestionAdditionById,
    discardQuestionEditById,
    downloadQuestionSyncRequest,
    handleQuestionEditSubmit,
    handleQuestionEntrySubmit,
    openQuestionEditModal,
    openQuestionEntryEditor,
    openQuestionEntryModal,
    openQuestionSyncRequestIssue,
    showQuestionEditManager,
    updateQuestionEditSummary,
    updateQuestionEntryChapterField,
    updateQuestionEntryTypeFields
} from './js/questionEditUI.js';
import {
    closeQuiz,
    nextQuizQuestion,
    openRandomTestSetup,
    startAllWrongAnswersTest,
    startChapterTest,
    startCurrentChapterWrongAnswersTest,
    startLastWrongQuizTest,
    submitQuizAnswer
} from './js/quiz.js';

const QUESTION_NOTICE_KEY = 'mech_design_question_notice_2026_07_02';

function showQuestionNoticeOnce() {
    if (localStorage.getItem(QUESTION_NOTICE_KEY)) return;
    configureModal('question-notice-modal', {
        closeOnBackdrop: true,
        onAfterClose: () => {
            localStorage.setItem(QUESTION_NOTICE_KEY, 'dismissed');
        }
    });
    openModal('question-notice-modal');
}

function closeQuestionNotice() {
    localStorage.setItem(QUESTION_NOTICE_KEY, 'dismissed');
    closeModal('question-notice-modal');
}

function handleBackupImported() {
    closeDataSync();
    refreshQuestionChangeViews();
    updateQuestionEditSummary();
}

document.addEventListener('DOMContentLoaded', () => {
    initIcons();
    processData();
    loadQuestionEdits();

    // 加载全部持久化数据
    loadWrongAnswers();
    loadFavorites();
    loadStats();
    loadPracticeSettings();
    const initialScale = loadFontScale();
    loadSidebarPreference();
    loadNotepad();

    // 架设 UI
    setupMobileMenu();
    setupSearchFilters();
    createNavigationAndContent();
    syncFontScaleButtons(initialScale);
    syncDesktopSidebarButton();
    setupStickyChromeBehavior();
    setupBackToTopButton();
    initWallpaper();
    updateQuestionEditSummary();
    setupFeedbackHandlers();

    document.querySelector('.font-size-segmented')?.addEventListener('click', e => {
        const btn = e.target.closest('button[data-font-scale]');
        if (!btn) return;
        const nextScale = setFontScale(btn.dataset.fontScale);
        syncFontScaleButtons(nextScale);
    });

    // 初始化夜间模式（与 head 内联脚本保持同步）
    const toggleSwitch = document.getElementById('dark-mode-switch');
    const savedTheme = localStorage.getItem(THEME_KEY);
    const isDark = savedTheme === 'dark' || document.documentElement.classList.contains('dark-mode');
    if (isDark) {
        document.documentElement.classList.add('dark-mode');
        document.body.classList.add('dark-mode');
        if (toggleSwitch) toggleSwitch.checked = true;
    }
    toggleSwitch?.addEventListener('change', function () {
        changeTheme(this.checked);
    });

    // 注册基础弹窗遮罩点击关闭策略
    [
        'dashboard-modal',
        'question-edit-manager-modal',
        'data-modal',
        'cropper-modal',
        'search-modal'
    ].forEach(id => configureModal(id, { closeOnBackdrop: true }));

    showQuestionNoticeOnce();

    // 事件委托枢纽：处理动态生成的动作按钮
    document.body.addEventListener('click', e => {
        const actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;

        const action = actionBtn.dataset.action;
        const qid = actionBtn.dataset.qid;
        const chapter = actionBtn.dataset.chapter;

        switch (action) {
            case 'showHome': showHome(); break;
            case 'startMockExam': openRandomTestSetup('exam'); break;
            case 'startOverallTestMcq': openRandomTestSetup('mcq'); break;
            case 'startOverallTestTf': openRandomTestSetup('tf'); break;
            case 'startAllWrongAnswersTest': startAllWrongAnswersTest(); break;
            case 'startLastWrongQuizTest': startLastWrongQuizTest(); break;
            case 'showDashboard': showDashboard(); break;
            case 'showAllFavorites': showAllFavorites(); break;
            case 'showAllWrongAnswers': showAllWrongAnswers(); break;
            case 'openSearchModal': openSearchModal(); break;
            case 'showDataSync': showDataSync(); break;
            case 'showQuestionEditManager': showQuestionEditManager(); break;
            case 'openQuestionEntry': openQuestionEntryModal(); break;
            case 'showFeedback': showFeedbackModal(); break;
            case 'triggerWallpaperUpload': triggerWallpaperUpload(); break;
            case 'triggerDataFileImport': document.getElementById('data-file-input')?.click(); break;

            case 'showChapterWrongAnswers': showChapterWrongAnswers(chapter, actionBtn); break;
            case 'showQuestions': showQuestions(chapter, actionBtn.dataset.type, actionBtn); break;
            case 'startChapterTest': startChapterTest(chapter); break;
            case 'jumpToQuestion': jumpToQuestion(qid); break;
            case 'setQuestionIndexView': setQuestionIndexView(actionBtn.dataset.view); break;
            case 'toggleQuestionIndexCollapse': toggleQuestionIndexCollapse(actionBtn); break;
            case 'selectPracticeOption': selectPracticeOption(actionBtn, updateChapterNavStatus); break;
            case 'toggleAnswer': toggleSingleAnswer(actionBtn); break;
            case 'toggleFavorite': toggleFavorite(qid, actionBtn); break;
            case 'removeWrongAnswer': removeSingleWrongAnswer(qid, chapter, actionBtn); break;
            case 'openQuestionEditor': openQuestionEditModal(qid); break;
            case 'openQuestionEntryEditor': openQuestionEntryEditor(qid); break;
            case 'discardQuestionEdit': discardQuestionEditById(qid); break;
            case 'discardQuestionAddition': discardQuestionAdditionById(qid); break;

            case 'closeQuiz': closeQuiz(); break;
        }
    });

    // 静态控制按钮绑定
    document.getElementById('notepad-toggle')?.addEventListener('click', toggleRightSidebar);
    document.getElementById('close-notepad')?.addEventListener('click', toggleRightSidebar);
    document.getElementById('chapter-drawer-toggle')?.addEventListener('click', () => toggleChapterDrawer());
    document.getElementById('close-chapter-drawer')?.addEventListener('click', closeChapterDrawer);
    document.getElementById('sidebar-collapse-toggle')?.addEventListener('click', toggleDesktopSidebar);
    document.getElementById('sidebar-close')?.addEventListener('click', () => document.body.classList.remove('sidebar-open'));

    document.getElementById('test-chapter-wrong-btn')?.addEventListener('click', startCurrentChapterWrongAnswersTest);
    document.getElementById('clear-chapter-wrong-answers-btn')?.addEventListener('click', clearCurrentChapterWrongAnswers);
    document.getElementById('test-all-wrong-btn')?.addEventListener('click', startAllWrongAnswersTest);
    document.getElementById('clear-all-wrong-answers-btn')?.addEventListener('click', clearAllWrongAnswers);
    document.getElementById('toggle-pending-wrong-btn')?.addEventListener('click', togglePendingWrongView);
    document.getElementById('toggle-practice-track-btn')?.addEventListener('click', togglePracticeTrackProgress);

    document.getElementById('toggle-favorites-btn')?.addEventListener('click', toggleFavoritesView);
    document.getElementById('toggle-all-answers-btn')?.addEventListener('click', toggleAllAnswers);

    document.getElementById('btn-download-notepad')?.addEventListener('click', downloadNotepadTxt);
    document.getElementById('btn-clear-notepad')?.addEventListener('click', async () => {
        const notepad = document.getElementById('notepad');
        if (!notepad || !notepad.value) {
            showToast('笔记已经是空的。', 'info');
            return;
        }
        const confirmed = await confirmDialog({
            title: '清空随手记',
            message: '确定要清空所有随手记内容吗？此操作不可撤销。',
            confirmText: '清空',
            danger: true
        });
        if (!confirmed) return;
        notepad.value = '';
        safeStorageRemove(NOTEPAD_KEY);
        showToast('随手记已清空。', 'info');
    });

    document.getElementById('close-dashboard')?.addEventListener('click', closeDashboard);
    document.getElementById('close-search-modal')?.addEventListener('click', closeSearchModal);
    document.getElementById('close-cropper')?.addEventListener('click', closeCropper);
    document.getElementById('btn-confirm-crop')?.addEventListener('click', confirmCrop);
    document.getElementById('close-data-sync')?.addEventListener('click', closeDataSync);
    document.getElementById('close-question-entry')?.addEventListener('click', closeQuestionEntryModal);
    document.getElementById('btn-cancel-question-entry')?.addEventListener('click', closeQuestionEntryModal);
    document.getElementById('close-question-edit')?.addEventListener('click', closeQuestionEditModal);
    document.getElementById('close-question-edit-manager')?.addEventListener('click', closeQuestionEditManager);
    document.getElementById('question-entry-form')?.addEventListener('submit', handleQuestionEntrySubmit);
    document.getElementById('question-entry-chapter')?.addEventListener('change', updateQuestionEntryChapterField);
    document.getElementById('question-entry-type')?.addEventListener('change', updateQuestionEntryTypeFields);
    document.getElementById('question-edit-form')?.addEventListener('submit', handleQuestionEditSubmit);
    document.getElementById('btn-discard-question-edit')?.addEventListener('click', discardCurrentQuestionEdit);
    document.getElementById('btn-copy-question-sync')?.addEventListener('click', copyQuestionSyncRequest);
    document.getElementById('btn-download-question-sync')?.addEventListener('click', downloadQuestionSyncRequest);
    document.getElementById('btn-open-question-sync-issue')?.addEventListener('click', openQuestionSyncRequestIssue);
    document.getElementById('btn-confirm-question-notice')?.addEventListener('click', closeQuestionNotice);

    document.getElementById('btn-export-data')?.addEventListener('click', exportData);
    document.getElementById('btn-copy-export-data')?.addEventListener('click', copyExportData);
    document.getElementById('btn-import-data')?.addEventListener('click', () => {
        importData(null, { onImported: handleBackupImported });
    });
    document.getElementById('data-file-input')?.addEventListener('change', function () {
        importDataFile(this.files[0], handleBackupImported);
        this.value = '';
    });
    document.getElementById('submit-answer-btn')?.addEventListener('click', () => submitQuizAnswer(false));
    document.getElementById('next-question-btn')?.addEventListener('click', nextQuizQuestion);

    document.getElementById('wallpaper-upload')?.addEventListener('change', function () {
        handleWallpaperUpload(this);
    });

    document.getElementById('notepad')?.addEventListener('input', saveNotepad);
});

// 监听键盘事件：支持 `/` 呼出搜索以及答题弹窗快速作答（同时不劫持聚焦在交互按钮上的原生回车/空格）
window.addEventListener('keydown', function (event) {
    const target = event.target;
    if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) {
        if (!(target.tagName === 'INPUT' && target.type === 'radio')) {
            return;
        }
    }

    if (event.key === '/' && !isAnyModalOpen()) {
        event.preventDefault();
        openSearchModal();
        return;
    }

    if (isModalOpen('quiz-modal') && !isModalOpen('app-confirm-modal')) {
        const question = state.quizQuestions[state.currentQuestionIndex];
        const key = event.key.toUpperCase();
        let handled = false;

        if (state.quizState === 'ANSWERING' && question) {
            if (question.type === 'mcq') {
                if (['A', 'B', 'C', 'D'].includes(key) || ['1', '2', '3', '4'].includes(key)) {
                    const mapIndex = ['1', '2', '3', '4'].includes(key) ? parseInt(key, 10) - 1 : ['A', 'B', 'C', 'D'].indexOf(key);
                    const options = document.querySelectorAll('input[name="quizOption"]');
                    if (options[mapIndex]) options[mapIndex].checked = true;
                    handled = true;
                }
            } else if (question.type === 'tf') {
                const options = document.querySelectorAll('input[name="quizOption"]');
                if (['T', '1', 'A'].includes(key)) {
                    if (options[0]) options[0].checked = true;
                    handled = true;
                } else if (['F', '2', 'B'].includes(key)) {
                    if (options[1]) options[1].checked = true;
                    handled = true;
                }
            }
        }

        const activeEl = document.activeElement;
        const isActionFocused = activeEl instanceof HTMLElement
            && activeEl.matches('button, summary, a')
            && !['submit-answer-btn', 'next-question-btn'].includes(activeEl.id);

        if (!isActionFocused && (event.code === 'Space' || key === ' ')) {
            if (state.quizState === 'ANSWERING') {
                handled = true;
                submitQuizAnswer(true);
            } else if (state.quizState === 'FEEDBACK') {
                handled = true;
                nextQuizQuestion();
            }
        }

        if (!isActionFocused && key === 'ENTER') {
            if (state.quizState === 'ANSWERING') {
                handled = true;
                submitQuizAnswer(false);
            } else if (state.quizState === 'FEEDBACK') {
                handled = true;
                nextQuizQuestion();
            }
        }

        if (handled) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
    }
}, true);
