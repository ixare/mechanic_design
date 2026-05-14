import { state } from './state.js';
import { typesetMath } from './utils.js';
import { getWrongAnswerQids, recordCorrectPractice, recordWrongAnswer, updateStats } from './storage.js';
import { updateChapterNavStatus } from './ui.js';

export function startChapterTest(chapterName) {
    const chapterData = state.all_data[chapterName];
    if (!chapterData || (chapterData.mcq.length === 0 && chapterData.tf.length === 0)) {
        alert('该章节没有题目可供测试！'); return;
    }
    startQuiz([...chapterData.mcq, ...chapterData.tf], 0, `${chapterName} - 随机测试`);
}

export function startOverallTest(type) {
    const questionPool = type === 'mcq' ? window.mcq_data : window.tf_data;
    startQuiz(questionPool, 20, type === 'mcq' ? '选择题综合测试' : '判断题综合测试');
}

export function startAllWrongAnswersTest() {
    const allWrongQids = getWrongAnswerQids();
    if (allWrongQids.length === 0) {
        alert('您的错题本是空的，无法开始测试！'); return;
    }
    const questionPool = allWrongQids.map(qid => state.question_lookup[qid]).filter(Boolean);
    startQuiz(questionPool, 0, '所有错题随机测试');
}

export function startCurrentChapterWrongAnswersTest() {
    if (!state.activeChapter) return;
    const chapterWrongQids = getWrongAnswerQids(state.activeChapter);
    if (chapterWrongQids.length === 0) {
        alert('本章没有错题，无法开始测试！'); return;
    }
    const questionPool = chapterWrongQids.map(qid => state.question_lookup[qid]).filter(Boolean);
    startQuiz(questionPool, 0, `【${state.activeChapter}】错题测试`);
}

export function startLastWrongQuizTest() {
    if (!state.lastWrongQuizQuestions.length) {
        alert('本次测试没有错题可重练！'); return;
    }
    startQuiz(state.lastWrongQuizQuestions, 0, '本次错题重练');
}

export function startMockExam() {
    const mcqs = [...window.mcq_data].sort(() => 0.5 - Math.random()).slice(0, 30);
    const tfs = [...window.tf_data].sort(() => 0.5 - Math.random()).slice(0, 20);
    const questions = [...mcqs, ...tfs].sort(() => 0.5 - Math.random());
    
    startQuiz(questions, 50, '模拟考试 (20分钟)');
    
    state.quizMode = 'exam';
    document.getElementById('quiz-timer').style.display = 'block';
    
    state.examTimeRemaining = 20 * 60; 
    updateTimerDisplay();
    
    if (state.examTimerInterval) clearInterval(state.examTimerInterval);
    state.examTimerInterval = setInterval(() => {
        state.examTimeRemaining--;
        updateTimerDisplay();
        if (state.examTimeRemaining <= 0) {
            clearInterval(state.examTimerInterval);
            state.examTimerInterval = null;
            alert('考试时间到！即将提交试卷。');
            showQuizResults(); 
        }
    }, 1000);
}

export function startQuiz(questionPool, numQuestions, title) {
    state.score = 0;
    state.currentQuestionIndex = 0;
    state.quizAnswers = [];
    state.lastWrongQuizQuestions = [];
    state.quizMode = 'practice';
    state.quizFinalized = false;
    state.quizQuestions = [...questionPool].sort(() => 0.5 - Math.random());
    if (numQuestions > 0 && numQuestions < state.quizQuestions.length) {
        state.quizQuestions = state.quizQuestions.slice(0, numQuestions);
    }
    state.quizLength = state.quizQuestions.length;

    if (state.quizLength === 0) { alert('没有可供测试的题目！'); return; }

    document.getElementById('quiz-title').textContent = title;
    document.getElementById('quiz-score').style.display = 'none';
    document.getElementById('quiz-content').style.display = 'block';
    document.getElementById('quiz-modal').style.display = 'block';
    document.getElementById('quiz-timer').style.display = 'none';

    displayQuizQuestion();
}

export function updateTimerDisplay() {
    const m = Math.floor(state.examTimeRemaining / 60).toString().padStart(2, '0');
    const s = (state.examTimeRemaining % 60).toString().padStart(2, '0');
    const timerEl = document.getElementById('quiz-timer');
    timerEl.textContent = `${m}:${s}`;
    if (state.examTimeRemaining < 60) {
        timerEl.style.color = 'var(--error)';
    } else {
        timerEl.style.color = 'var(--primary)';
    }
}

export function closeQuiz() {
    document.getElementById('quiz-modal').style.display = 'none';
    document.getElementById('quiz-timer').style.display = 'none';
    if (state.examTimerInterval) clearInterval(state.examTimerInterval);
    state.examTimerInterval = null;
    state.quizState = 'IDLE';
}

export function displayQuizQuestion() {
    if (state.currentQuestionIndex < state.quizLength) {
        const question = state.quizQuestions[state.currentQuestionIndex];
        const questionContainer = document.getElementById('quiz-question-container');
        const instructionsEl = document.getElementById('keyboard-instructions');
        
        instructionsEl.textContent = question.type === 'mcq' ? 
            '提示：使用键盘 A/B/C/D 或 1/2/3/4 选择，Enter 确认，Space跳过。' : 
            '提示：使用键盘 T/1(对) / F/2(错) 选择，Enter 确认，Space跳过。';

        document.getElementById('quiz-question-text').innerHTML = question.question.replace(/(\(|\（)\s*(\)|\）)/, ' (   ) ');
        const optionsContainer = document.getElementById('quiz-options');
        optionsContainer.innerHTML = '';

        const favBtn = document.getElementById('quiz-favorite-btn');
        favBtn.style.display = 'inline-block';
        favBtn.className = `action-button favorite-button ${state.favorites.includes(question.qid) ? 'favorited' : ''}`;
        favBtn.innerHTML = state.favorites.includes(question.qid) ? '<i class="fa-solid fa-star"></i> 已收藏' : '<i class="fa-regular fa-star"></i> 收藏';
        favBtn.dataset.qid = question.qid;
        favBtn.dataset.action = "toggleFavorite";

        if (question.type === 'mcq') {
            question.options.forEach(option => {
                const label = document.createElement('label');
                const radio = Object.assign(document.createElement('input'), { type: 'radio', name: 'quizOption', value: option.charAt(0) });
                label.appendChild(radio);
                label.appendChild(document.createTextNode(option));
                optionsContainer.appendChild(label);
            });
        } else {
            const labelTrue = document.createElement('label');
            const radioTrue = Object.assign(document.createElement('input'), { type: 'radio', name: 'quizOption', value: '✓' });
            labelTrue.appendChild(radioTrue);
            labelTrue.appendChild(document.createTextNode('✓ 正确'));

            const labelFalse = document.createElement('label');
            const radioFalse = Object.assign(document.createElement('input'), { type: 'radio', name: 'quizOption', value: '×' });
            labelFalse.appendChild(radioFalse);
            labelFalse.appendChild(document.createTextNode('× 错误'));

            optionsContainer.appendChild(labelTrue);
            optionsContainer.appendChild(labelFalse);
        }

        document.getElementById('quiz-progress').textContent = `进度: ${state.currentQuestionIndex + 1} / ${state.quizLength}`;
        document.getElementById('quiz-feedback').style.display = 'none';
        document.getElementById('submit-answer-btn').style.display = 'inline-block';
        document.getElementById('next-question-btn').style.display = 'none';
        
        typesetMath([questionContainer]);
        
        state.quizState = 'ANSWERING';
        state.quizFinalized = false;

    } else {
        showQuizResults();
    }
}

export function submitQuizAnswer(skipped = false) {
    if (state.quizFinalized) return;
    let userAnswer = null;
    if (!skipped) {
        const selectedOption = document.querySelector('input[name="quizOption"]:checked');
        if (!selectedOption) { alert('请先选择一个答案！'); return; }
        userAnswer = selectedOption.value;
    }
    
    const question = state.quizQuestions[state.currentQuestionIndex];
    const isCorrect = !skipped && (userAnswer === question.answer);
    const answerRecord = {
        qid: question.qid,
        userAnswer: skipped ? '跳过' : userAnswer,
        correctAnswer: question.answer,
        isCorrect,
        skipped,
        chapter: question.chapter,
        type: question.type
    };
    state.quizAnswers[state.currentQuestionIndex] = answerRecord;
    
    updateStats(question, isCorrect);

    if (isCorrect) {
        state.score++;
        recordCorrectPractice(question);
    } else {
        recordWrongAnswer(question, document.getElementById('quiz-title').textContent || 'quiz');
        updateChapterNavStatus();
    }

    const feedbackEl = document.getElementById('quiz-feedback');
    feedbackEl.className = isCorrect ? 'correct' : 'incorrect';
    let explanationText = question.explanation || '暂无解析';
    if (typeof marked !== 'undefined' && marked.parse) {
        explanationText = marked.parse(explanationText);
    }
    if (typeof DOMPurify !== 'undefined') {
        explanationText = DOMPurify.sanitize(explanationText);
    }
    
    const feedbackPrefix = isCorrect ? '回答正确！' : (skipped ? '已跳过。' : '回答错误。');
    feedbackEl.innerHTML = `${feedbackPrefix}${isCorrect ? '' : `正确答案是：${question.answer}`}` + 
        `<br><br><div class="explanation-span">解析：${explanationText}</div>`;
    feedbackEl.style.display = 'block';

    typesetMath([feedbackEl]);

    document.getElementById('submit-answer-btn').style.display = 'none';
    document.getElementById('next-question-btn').style.display = 'inline-block';
    
    state.quizState = 'FEEDBACK';
}

export function nextQuizQuestion() {
    state.currentQuestionIndex++;
    displayQuizQuestion();
}

export function showQuizResults() {
    if (state.quizFinalized) return;
    state.quizFinalized = true;
    if (state.examTimerInterval) {
        clearInterval(state.examTimerInterval);
        state.examTimerInterval = null;
    }
    document.getElementById('quiz-timer').style.display = 'none';
    document.getElementById('quiz-content').style.display = 'none';
    const scoreEl = document.getElementById('quiz-score');
    scoreEl.style.display = 'block';
    state.lastWrongQuizQuestions = state.quizQuestions
        .map((question, index) => {
            const answer = state.quizAnswers[index];
            return !answer || !answer.isCorrect ? question : null;
        })
        .filter(Boolean);

    const reviewItems = state.quizQuestions.map((question, index) => {
        const answer = state.quizAnswers[index] || {
            userAnswer: '未作答',
            correctAnswer: question.answer,
            isCorrect: false,
            skipped: true
        };
        let explanationText = question.explanation || '暂无解析';
        if (typeof marked !== 'undefined' && marked.parse) {
            explanationText = marked.parse(explanationText);
        }
        if (typeof DOMPurify !== 'undefined') {
            explanationText = DOMPurify.sanitize(explanationText);
        }
        return `
            <details class="quiz-review-item ${answer.isCorrect ? 'is-correct' : 'is-wrong'}">
                <summary>
                    <span>第 ${index + 1} 题</span>
                    <strong>${answer.isCorrect ? '正确' : (answer.skipped ? '跳过' : '错误')}</strong>
                </summary>
                <p>${question.question.replace(/(\(|\（)\s*(\)|\）)/, ' (   ) ')}</p>
                ${question.type === 'mcq' ? `<ul>${question.options.map(option => `<li>${option}</li>`).join('')}</ul>` : ''}
                <div class="quiz-review-answer">
                    <span>你的答案：${answer.userAnswer}</span>
                    <span>正确答案：${question.answer}</span>
                </div>
                <div class="explanation-span"><b>解析：</b>${explanationText}</div>
            </details>
        `;
    }).join('');

    const wrongRetryButton = state.lastWrongQuizQuestions.length > 0
        ? '<button class="quiz-button" data-action="startLastWrongQuizTest"><i class="fa-solid fa-rotate-right"></i> 重练本次错题</button>'
        : '';

    scoreEl.innerHTML = `
        <h3>测试结束！</h3>
        <p>你的得分: <span style="color:var(--primary-color);font-size:1.5em;">${state.score}</span> / ${state.quizLength}</p>
        <p>正确率: ${Math.round((state.score / state.quizLength) * 100)}%</p>
        <p>本次错题: ${state.lastWrongQuizQuestions.length} 道</p>
        <div class="quiz-result-actions">
            ${wrongRetryButton}
            <button class="quiz-button" data-action="closeQuiz" style="background-color:var(--secondary-color);">关闭</button>
        </div>
        <div class="quiz-review-list">${reviewItems}</div>
    `;
    typesetMath([scoreEl]);
    state.quizState = 'IDLE';
}
