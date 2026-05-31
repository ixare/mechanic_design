import { state, processData } from './js/state.js';
import { 
    loadWrongAnswers, loadFavorites, loadStats, loadNotepad, 
    saveNotepad, exportData, copyExportData, importData, importDataFile, changeTheme
} from './js/storage.js';
import { 
    setupMobileMenu, createNavigationAndContent, toggleRightSidebar, 
    setupSearchFilters,
    showDashboard, closeDashboard, showDataSync, closeDataSync, 
    downloadNotepadTxt, initWallpaper, triggerWallpaperUpload, 
    handleWallpaperUpload, confirmCrop, closeCropper,
    removeSingleWrongAnswer, toggleFavorite, toggleAllAnswers, toggleFavoritesView, clearCurrentChapterWrongAnswers,
    showQuestions, showChapterWrongAnswers, showAllFavorites, filterQuestions,
    showAllWrongAnswers, clearAllWrongAnswers, changePage
} from './js/ui.js';
import {
    startMockExam, startOverallTest, startAllWrongAnswersTest, 
    startCurrentChapterWrongAnswersTest, startChapterTest,
    startLastWrongQuizTest, submitQuizAnswer, nextQuizQuestion, closeQuiz,
    openRandomTestSetup
} from './js/quiz.js';
import { typesetMath } from './js/utils.js';

document.addEventListener('DOMContentLoaded', () => {
    processData();
    
    // 加载全部持久化数据
    loadWrongAnswers();
    loadFavorites();
    loadStats();
    loadNotepad();
    
    // 架设 UI
    setupMobileMenu();
    setupSearchFilters();
    createNavigationAndContent();
    initWallpaper();

    // 初始化夜间模式
    const toggleSwitch = document.getElementById('dark-mode-switch');
    const savedTheme = localStorage.getItem('mech_design_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        toggleSwitch.checked = true;
    }
    toggleSwitch.addEventListener('change', function() {
        changeTheme(this.checked);
    });

    // 事件委托枢纽：替代零碎的行内 onclick 调用
    document.body.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
            const action = actionBtn.dataset.action;
            const qid = actionBtn.dataset.qid;
            const chapter = actionBtn.dataset.chapter;

            switch(action) {
                case 'startMockExam': openRandomTestSetup('exam'); break;
                case 'startOverallTestMcq': openRandomTestSetup('mcq'); break;
                case 'startOverallTestTf': openRandomTestSetup('tf'); break;
                case 'startAllWrongAnswersTest': startAllWrongAnswersTest(); break;
                case 'startLastWrongQuizTest': startLastWrongQuizTest(); break;
                case 'showDashboard': showDashboard(); break;
                case 'showAllFavorites': showAllFavorites(); break;
                case 'showAllWrongAnswers': showAllWrongAnswers(); break;
                case 'showDataSync': showDataSync(); break;
                case 'showFeedback': showFeedbackModal(); break;
                case 'triggerWallpaperUpload': triggerWallpaperUpload(); break;
                case 'triggerDataFileImport': document.getElementById('data-file-input')?.click(); break;
                
                case 'showChapterWrongAnswers': showChapterWrongAnswers(chapter, actionBtn); break;
                case 'showQuestions': showQuestions(chapter, actionBtn.dataset.type, actionBtn); break;
                case 'startChapterTest': startChapterTest(chapter); break;
                case 'changePage': changePage(actionBtn.dataset.page); break;
                
                case 'toggleAnswer': 
                    const answerSpan = actionBtn.nextElementSibling;
                    const explanationSpan = answerSpan.nextElementSibling;
                    const isShowing = actionBtn.dataset.state === 'shown';
                    answerSpan.style.display = isShowing ? 'none' : 'inline';
                    explanationSpan.style.display = isShowing ? 'none' : 'block';
                    actionBtn.dataset.state = isShowing ? 'hidden' : 'shown';
                    actionBtn.innerHTML = isShowing ? '<i class="fa-regular fa-eye"></i> 显示答案' : '<i class="fa-regular fa-eye-slash"></i> 隐藏答案';
                    if (!isShowing) typesetMath([explanationSpan]);
                    break;
                case 'toggleFavorite': toggleFavorite(qid, actionBtn); break;
                case 'removeWrongAnswer': removeSingleWrongAnswer(qid, chapter, actionBtn); break;
                
                case 'closeQuiz': closeQuiz(); break;
            }
        }
    });

    // 绑定单一元素静态事件
    document.getElementById('notepad-toggle').addEventListener('click', toggleRightSidebar);
    
    document.getElementById('test-chapter-wrong-btn').addEventListener('click', startCurrentChapterWrongAnswersTest);
    document.getElementById('clear-chapter-wrong-answers-btn').addEventListener('click', clearCurrentChapterWrongAnswers);
    document.getElementById('test-all-wrong-btn').addEventListener('click', startAllWrongAnswersTest);
    document.getElementById('clear-all-wrong-answers-btn').addEventListener('click', clearAllWrongAnswers);
    
    document.getElementById('toggle-favorites-btn').addEventListener('click', toggleFavoritesView);
    document.getElementById('toggle-all-answers-btn').addEventListener('click', toggleAllAnswers);
    
    document.getElementById('btn-download-notepad').addEventListener('click', downloadNotepadTxt);
    document.getElementById('btn-clear-notepad').addEventListener('click', () => {
        if (confirm('确定要清空笔记吗？')) {
            document.getElementById('notepad').value = '';
            localStorage.removeItem('mech_design_notepad');
        }
    });
    
    document.getElementById('close-dashboard').addEventListener('click', closeDashboard);
    document.getElementById('close-cropper').addEventListener('click', closeCropper);
    document.getElementById('btn-confirm-crop').addEventListener('click', confirmCrop);
    document.getElementById('close-data-sync').addEventListener('click', closeDataSync);
    
    document.getElementById('btn-export-data').addEventListener('click', exportData);
    document.getElementById('btn-copy-export-data')?.addEventListener('click', copyExportData);
    document.getElementById('btn-import-data').addEventListener('click', importData);
    document.getElementById('data-file-input')?.addEventListener('change', function() {
        importDataFile(this.files[0]);
        this.value = '';
    });
    document.getElementById('submit-answer-btn').addEventListener('click', () => submitQuizAnswer(false));
    document.getElementById('next-question-btn').addEventListener('click', nextQuizQuestion);

    const checkWallpaperInput = document.getElementById('wallpaper-upload');
    if(checkWallpaperInput) {
        checkWallpaperInput.addEventListener('change', function() {
            handleWallpaperUpload(this);
        });
    }

    const searchInput = document.getElementById('global-search');
    if(searchInput) {
        searchInput.addEventListener('input', function() {
            filterQuestions(this.value);
        });
    }

    const notepadInput = document.getElementById('notepad');
    if(notepadInput) {
        notepadInput.addEventListener('input', saveNotepad);
    }
});

// 监听键盘事件，支援快速答题引擎 (使用捕获阶段防止 Vim 等插件拦截)
window.addEventListener('keydown', function(event) {
    const target = event.target;
    if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) {
        return;
    }

    const quizModal = document.getElementById('quiz-modal');
    const isModalVisible = quizModal && quizModal.style.display === 'block' && window.getComputedStyle(quizModal).display !== 'none';
    
    if (isModalVisible) {
        const question = state.quizQuestions[state.currentQuestionIndex];
        const key = event.key.toUpperCase();
        let handled = false;
        
        if (state.quizState === 'ANSWERING' && question) {
            if (question.type === 'mcq') {
                if (['A','B','C','D'].includes(key) || ['1','2','3','4'].includes(key)) {
                    const mapIndex = (['1','2','3','4'].includes(key)) ? parseInt(key)-1 : ['A','B','C','D'].indexOf(key);
                    const options = document.querySelectorAll('input[name="quizOption"]');
                    if(options[mapIndex]) options[mapIndex].checked = true;
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
        
        if (event.code === 'Space' || key === ' ') {
            handled = true;
            if (state.quizState === 'ANSWERING') {
                submitQuizAnswer(true);
            } else if (state.quizState === 'FEEDBACK') {
                nextQuizQuestion();
            }
        }

        if (key === 'ENTER') {
            handled = true;
            if (state.quizState === 'ANSWERING') {
                submitQuizAnswer(false);
            } else if (state.quizState === 'FEEDBACK') {
                nextQuizQuestion();
            }
        }
        
        if (handled) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
    }
}, true); // 注意：此处 useCapture = true，在捕获阶段优先拦截事件

// 反馈模块
function showFeedbackModal() {
    document.getElementById('feedback-modal').style.display = 'block';
}

function closeFeedbackModal() {
    document.getElementById('feedback-modal').style.display = 'none';
    document.getElementById('feedback-content').value = '';
}

function buildFeedbackText() {
    const type = document.getElementById('feedback-type').value;
    const content = document.getElementById('feedback-content').value.trim();
    const typeLabels = { bug: 'Bug / 题目错误', feature: '功能建议', other: '其他' };
    return `【${typeLabels[type]}】\n${content}`;
}

document.getElementById('close-feedback').addEventListener('click', closeFeedbackModal);

document.getElementById('btn-feedback-github').addEventListener('click', () => {
    const type = document.getElementById('feedback-type').value;
    const content = document.getElementById('feedback-content').value.trim();
    if (!content) { alert('请填写反馈内容'); return; }
    const labels = { bug: 'bug', feature: 'enhancement', other: '' };
    const title = encodeURIComponent(content.slice(0, 60));
    const body = encodeURIComponent(buildFeedbackText());
    const label = labels[type] ? `&labels=${labels[type]}` : '';
    window.open(`https://github.com/ixare/mechanic_design/issues/new?title=${title}&body=${body}${label}`, '_blank');
    closeFeedbackModal();
});

document.getElementById('btn-feedback-copy').addEventListener('click', () => {
    const content = document.getElementById('feedback-content').value.trim();
    if (!content) { alert('请填写反馈内容'); return; }
    navigator.clipboard.writeText(buildFeedbackText()).then(() => {
        alert('反馈内容已复制到剪贴板');
    });
});
