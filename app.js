import { state, processData } from './js/state.js';
import { 
    loadWrongAnswers, loadFavorites, loadStats, loadNotepad, 
    saveNotepad, exportData, importData, changeTheme
} from './js/storage.js';
import { 
    setupMobileMenu, createNavigationAndContent, toggleRightSidebar, 
    showDashboard, closeDashboard, showDataSync, closeDataSync, 
    downloadNotepadTxt, initWallpaper, triggerWallpaperUpload, 
    handleWallpaperUpload, confirmCrop, closeCropper,
    removeSingleWrongAnswer, toggleFavorite, toggleAllAnswers, toggleFavoritesView, clearCurrentChapterWrongAnswers,
    showQuestions, showChapterWrongAnswers, showAllFavorites, filterQuestions,
    showAllWrongAnswers, clearAllWrongAnswers
} from './js/ui.js';
import {
    startMockExam, startOverallTest, startAllWrongAnswersTest, 
    startCurrentChapterWrongAnswersTest, startChapterTest,
    submitQuizAnswer, nextQuizQuestion, closeQuiz
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
                case 'startMockExam': startMockExam(); break;
                case 'startOverallTestMcq': startOverallTest('mcq'); break;
                case 'startOverallTestTf': startOverallTest('tf'); break;
                case 'startAllWrongAnswersTest': startAllWrongAnswersTest(); break;
                case 'showDashboard': showDashboard(); break;
                case 'showAllFavorites': showAllFavorites(); break;
                case 'showAllWrongAnswers': showAllWrongAnswers(); break;
                case 'showDataSync': showDataSync(); break;
                case 'triggerWallpaperUpload': triggerWallpaperUpload(); break;
                
                case 'showChapterWrongAnswers': showChapterWrongAnswers(chapter, actionBtn); break;
                case 'showQuestions': showQuestions(chapter, actionBtn.dataset.type, actionBtn); break;
                case 'startChapterTest': startChapterTest(chapter); break;
                
                case 'toggleAnswer': 
                    const answerSpan = actionBtn.nextElementSibling;
                    const explanationSpan = answerSpan.nextElementSibling;
                    answerSpan.style.display = 'inline';
                    explanationSpan.style.display = 'block';
                    typesetMath([explanationSpan]);
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
    document.getElementById('btn-import-data').addEventListener('click', importData);
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
