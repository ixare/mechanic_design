import { state } from './state.js';
import { typesetMath } from './utils.js';
import { saveFavorites, saveWrongAnswers, WALLPAPER_KEY } from './storage.js';

export function setupMobileMenu() {
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const notepadToggle = document.getElementById('notepad-toggle');
    const rightSidebar = document.getElementById('right-sidebar');

    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        document.body.classList.toggle('sidebar-open');
        if (document.body.classList.contains('right-sidebar-open')) {
            document.body.classList.remove('right-sidebar-open');
        }
    });

    sidebar.addEventListener('click', (event) => {
        if (event.target.tagName === 'BUTTON' && window.innerWidth <= 992) {
            document.body.classList.remove('sidebar-open');
        }
    });
    
    document.addEventListener('click', (event) => {
        const isClickInsideLeft = sidebar.contains(event.target) || menuToggle.contains(event.target);
        const isClickInsideRight = rightSidebar.contains(event.target) || notepadToggle.contains(event.target);
        
        if (!isClickInsideLeft && document.body.classList.contains('sidebar-open')) {
            document.body.classList.remove('sidebar-open');
        }
        
        if (!isClickInsideRight && document.body.classList.contains('right-sidebar-open')) {
            document.body.classList.remove('right-sidebar-open');
        }
    });
}

export function updateChapterNavStatus() {
    document.querySelectorAll('#chapter-nav-list details').forEach(detail => {
        const chapterName = detail.dataset.chapterName;
        const wrongBtn = detail.querySelector('.chapter-wrong-button');
        const wrongCount = (state.wrongAnswersByChapter[chapterName] || []).length;
        if (wrongCount > 0) {
            wrongBtn.textContent = `本章错题 (${wrongCount})`;
            wrongBtn.disabled = false;
        } else {
            wrongBtn.textContent = '本章错题 (0)';
            wrongBtn.disabled = true;
        }
    });
}

export function updateGlobalControls(show, options = {}) {
    document.getElementById('global-controls').style.display = show ? 'flex' : 'none';
    if (!show) return;

    document.getElementById('toggle-favorites-btn').style.display = 'none';
    document.getElementById('clear-chapter-wrong-answers-btn').style.display = 'none';
    document.getElementById('test-chapter-wrong-btn').style.display = 'none';
    document.getElementById('test-all-wrong-btn').style.display = 'none';
    document.getElementById('clear-all-wrong-answers-btn').style.display = 'none';
    
    if (options.showFavoriteFilter) document.getElementById('toggle-favorites-btn').style.display = 'inline-block';
    if (options.showChapterWrongClear) document.getElementById('clear-chapter-wrong-answers-btn').style.display = 'inline-block';
    if (options.showChapterWrongTest) document.getElementById('test-chapter-wrong-btn').style.display = 'inline-block';
    if (options.showAllWrongClear) document.getElementById('clear-all-wrong-answers-btn').style.display = 'inline-block';
    if (options.showAllWrongTest) document.getElementById('test-all-wrong-btn').style.display = 'inline-block';
    
    document.getElementById('toggle-all-answers-btn').textContent = '显示全部答案';
    document.getElementById('toggle-favorites-btn').textContent = '只显示收藏';
}

export function createNavigationAndContent() {
    const chapterNavList = document.getElementById('chapter-nav-list');
    const contentArea = document.getElementById('content-area');
    chapterNavList.innerHTML = '';
    contentArea.innerHTML = '';

    Object.keys(state.all_data).sort((a, b) => {
        const numA = parseInt(a.match(/第(\S+)章/)[1].replace(/[\u4e00-\u9fa5]/g, match => ' 一二三四五六七八九十'.indexOf(match)));
        const numB = parseInt(b.match(/第(\S+)章/)[1].replace(/[\u4e00-\u9fa5]/g, match => ' 一二三四五六七八九十'.indexOf(match)));
        return numA - numB;
    }).forEach(chapterName => {
        const details = document.createElement('details');
        details.dataset.chapterName = chapterName;
        
        const summary = document.createElement('summary');
        summary.textContent = chapterName;
        details.appendChild(summary);

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'chapter-button-container';
        
        const wrongBtn = document.createElement('button');
        wrongBtn.className = 'chapter-wrong-button';
        wrongBtn.dataset.chapter = chapterName;
        wrongBtn.dataset.action = 'showChapterWrongAnswers';
        buttonContainer.appendChild(wrongBtn);
        
        const mcqBtn = document.createElement('button');
        mcqBtn.className = 'chapter-type-button';
        mcqBtn.innerHTML = '<i class="fa-solid fa-list-ul"></i> 选择题';
        mcqBtn.dataset.chapter = chapterName;
        mcqBtn.dataset.type = 'mcq';
        mcqBtn.dataset.action = 'showQuestions';
        buttonContainer.appendChild(mcqBtn);

        const tfBtn = document.createElement('button');
        tfBtn.className = 'chapter-type-button';
        tfBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> 判断题';
        tfBtn.dataset.chapter = chapterName;
        tfBtn.dataset.type = 'tf';
        tfBtn.dataset.action = 'showQuestions';
        buttonContainer.appendChild(tfBtn);

        const testBtn = document.createElement('button');
        testBtn.className = 'chapter-test-button';
        testBtn.innerHTML = '<i class="fa-solid fa-flask"></i> 本章测试';
        testBtn.dataset.chapter = chapterName;
        testBtn.dataset.action = 'startChapterTest';
        buttonContainer.appendChild(testBtn);

        details.appendChild(buttonContainer);
        chapterNavList.appendChild(details);
    });

    updateChapterNavStatus();
}

export function renderQuestions(questionsList) {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = '';
    let visibleBlocks = [];
    questionsList.forEach(item => {
        const block = createQuestionBlock(item);
        block.classList.add('visible');
        contentArea.appendChild(block);
        visibleBlocks.push(block);
    });
    return visibleBlocks;
}

export function createQuestionBlock(item) {
    const block = document.createElement('div');
    block.className = 'question-block';
    block.dataset.qid = item.qid;
    block.dataset.chapter = item.chapter;
    block.dataset.type = item.type;

    let explanationHtml = '';
    if (item.explanation) {
        // DOMPurify and marked will be available globally as they are added via CDN to global scope.
        explanationHtml = (typeof marked !== 'undefined' && marked.parse) ? marked.parse(item.explanation) : item.explanation;
        if (typeof DOMPurify !== 'undefined') {
            explanationHtml = DOMPurify.sanitize(explanationHtml);
        }
    }

    const isFav = state.favorites.includes(item.qid);
    block.innerHTML = `
        <p>${item.question.replace(/(\(|\（)\s*(\)|\）)/, ' (   ) ')}</p>
        ${item.type === 'mcq' ? `<ul>${item.options.map(o => `<li>${o}</li>`).join('')}</ul>` : ''}
        <div class="action-buttons-container">
            <button class="action-button" data-action="toggleAnswer"><i class="fa-regular fa-eye"></i> 显示答案</button>
            <span class="answer-span">答案: ${item.answer}</span>
            <div class="explanation-span">${explanationHtml ? `<b>解析：</b>${explanationHtml}` : ''}</div>
            <button class="action-button favorite-button ${isFav ? 'favorited' : ''}" data-qid="${item.qid}" data-action="toggleFavorite">${isFav ? '<i class="fa-solid fa-star"></i> 已收藏' : '<i class="fa-regular fa-star"></i> 收藏'}</button>
            <button class="action-button remove-wrong-answer-btn" data-qid="${item.qid}" data-chapter="${item.chapter}" data-action="removeWrongAnswer"><i class="fa-solid fa-trash-can"></i> 移除此题</button>
        </div>
    `;
    return block;
}

export function showQuestions(chapter, type, btn) {
    state.activeChapter = chapter;
    state.activeType = type;

    document.getElementById('welcome-message').style.display = 'none';
    updateGlobalControls(true, { showFavoriteFilter: true });
    document.getElementById('main-title').textContent = `${chapter} - ${type === 'mcq' ? '选择题' : '判断题'}`;

    if (state.activeChapterButton) state.activeChapterButton.classList.remove('active');
    if (btn) {
        btn.classList.add('active');
        state.activeChapterButton = btn;
    }

    const questionsPool = type === 'mcq' ? (state.all_data[chapter] ? state.all_data[chapter].mcq : []) : (state.all_data[chapter] ? state.all_data[chapter].tf : []);
    const visibleBlocks = renderQuestions(questionsPool);
    
    visibleBlocks.forEach(block => {
        const removeBtn = block.querySelector('.remove-wrong-answer-btn');
        if (removeBtn) removeBtn.style.display = 'none';
    });
    typesetMath(visibleBlocks);
}

export function showChapterWrongAnswers(chapterName, btn) {
    state.activeChapter = chapterName;
    state.activeType = null;
    
    document.getElementById('welcome-message').style.display = 'none';
    updateGlobalControls(true, { showChapterWrongClear: true, showChapterWrongTest: true });
    
    if (state.activeChapterButton) state.activeChapterButton.classList.remove('active');
    if (btn) {
        btn.classList.add('active');
        state.activeChapterButton = btn;
    }

    document.getElementById('main-title').textContent = `${chapterName} - 错题回顾`;

    const chapterWrongQids = state.wrongAnswersByChapter[chapterName] || [];
    const questionsList = chapterWrongQids.map(qid => state.question_lookup[qid]).filter(Boolean);
    const visibleBlocks = renderQuestions(questionsList);
    
    visibleBlocks.forEach(block => {
        const removeBtn = block.querySelector('.remove-wrong-answer-btn');
        if (removeBtn) removeBtn.style.display = 'inline-block';
    });
    typesetMath(visibleBlocks);

    if (chapterWrongQids.length === 0) {
        updateGlobalControls(false);
        document.getElementById('content-area').innerHTML = '';
        document.getElementById('welcome-message').style.display = 'block';
        document.getElementById('welcome-message').innerHTML = `<p>本章没有错题记录，继续保持！</p>`;
    }
}

export function showAllWrongAnswers() {
    state.activeChapter = null;
    state.activeType = null;
    
    document.getElementById('welcome-message').style.display = 'none';
    updateGlobalControls(true, { showAllWrongClear: true, showAllWrongTest: true });
    document.getElementById('main-title').textContent = '全局错题汇总';

    if (state.activeChapterButton) {
        state.activeChapterButton.classList.remove('active');
        state.activeChapterButton = null;
    }

    const allWrongQids = Object.values(state.wrongAnswersByChapter).flat();
    const questionsList = allWrongQids.map(qid => state.question_lookup[qid]).filter(Boolean);
    const visibleBlocks = renderQuestions(questionsList);
    
    visibleBlocks.forEach(block => {
        const removeBtn = block.querySelector('.remove-wrong-answer-btn');
        if (removeBtn) removeBtn.style.display = 'inline-block';
    });
    typesetMath(visibleBlocks);

    if (questionsList.length === 0) {
        updateGlobalControls(false);
        document.getElementById('content-area').innerHTML = '';
        document.getElementById('welcome-message').style.display = 'block';
        document.getElementById('welcome-message').innerHTML = `<p>太棒了！您当前没有任何错题记录。</p>`;
    }
}

export function showAllFavorites() {
    state.activeChapter = null;
    state.activeType = null;
    
    document.getElementById('welcome-message').style.display = 'none';
    updateGlobalControls(true);
    document.getElementById('main-title').textContent = '我的收藏';

    if (state.activeChapterButton) {
        state.activeChapterButton.classList.remove('active');
        state.activeChapterButton = null;
    }

    const favQuestions = state.favorites.map(qid => state.question_lookup[qid]).filter(Boolean);
    const visibleBlocks = renderQuestions(favQuestions);
    
    visibleBlocks.forEach(block => {
        const removeBtn = block.querySelector('.remove-wrong-answer-btn');
        if (removeBtn) removeBtn.style.display = 'none';
    });
    typesetMath(visibleBlocks);

    if (favQuestions.length === 0) {
        updateGlobalControls(false);
        document.getElementById('content-area').innerHTML = '';
        document.getElementById('welcome-message').style.display = 'block';
        document.getElementById('welcome-message').innerHTML = '<p>你还没有收藏任何题目。</p>';
    }
}

export function filterQuestions(query) {
    const searchTerm = query.trim().toLowerCase();
    
    if (state.activeChapterButton) {
        state.activeChapterButton.classList.remove('active');
        state.activeChapterButton = null;
    }
    
    if (searchTerm.length === 0) {
        document.getElementById('content-area').innerHTML = '';
        document.getElementById('welcome-message').style.display = 'block';
        document.getElementById('welcome-message').innerHTML = '<p>请从左侧选择一个章节和题型开始练习。</p><p>或者输入关键词搜索题目。</p>';
        updateGlobalControls(false);
        document.getElementById('main-title').textContent = '欢迎使用机械设计基础自测题库';
        return;
    }

    document.getElementById('welcome-message').style.display = 'none';
    updateGlobalControls(true, { showFavoriteFilter: true });
    document.getElementById('main-title').textContent = `搜索结果: "${query}"`;
    
    const allQuestions = [...window.mcq_data, ...window.tf_data];
    const filtered = allQuestions.filter(q => {
        const itemText = (q.question + (q.options ? q.options.join(' ') : '') + q.answer + (q.explanation || '')).toLowerCase();
        return itemText.includes(searchTerm);
    });

    const visibleBlocks = renderQuestions(filtered);
    visibleBlocks.forEach(block => {
        const removeBtn = block.querySelector('.remove-wrong-answer-btn');
        if (removeBtn) removeBtn.style.display = 'none';
    });

    if (filtered.length === 0) {
        updateGlobalControls(false);
        document.getElementById('content-area').innerHTML = '';
        document.getElementById('welcome-message').style.display = 'block';
        document.getElementById('welcome-message').innerHTML = `<p>未找到包含 "${query}" 的题目。</p>`;
    } else {
         typesetMath(visibleBlocks);
    }
}

export function showDashboard() {
    document.getElementById('dashboard-modal').style.display = 'block';
    document.getElementById('stat-total').textContent = state.userStats.total;
    const rate = state.userStats.total === 0 ? 0 : Math.round((state.userStats.correct / state.userStats.total) * 100);
    document.getElementById('stat-correct').textContent = `${rate}%`;
    document.getElementById('stat-correct').style.color = rate >= 60 ? 'var(--success)' : 'var(--error)';
    
    let totalWrong = 0;
    Object.values(state.wrongAnswersByChapter).forEach(arr => totalWrong += arr.length);
    document.getElementById('stat-wrong-count').textContent = totalWrong;

    const tbody = document.getElementById('stats-table-body');
    tbody.innerHTML = '';
    
    Object.keys(state.all_data).sort((a, b) => {
         const numA = parseInt(a.match(/第(\S+)章/)[1].replace(/[\u4e00-\u9fa5]/g, match => ' 一二三四五六七八九十'.indexOf(match)));
         const numB = parseInt(b.match(/第(\S+)章/)[1].replace(/[\u4e00-\u9fa5]/g, match => ' 一二三四五六七八九十'.indexOf(match)));
         return numA - numB;
    }).forEach(chapter => {
        const stats = state.userStats.chapterStats[chapter] || { total: 0, correct: 0 };
        const acc = stats.total === 0 ? 0 : Math.round((stats.correct / stats.total) * 100);
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${chapter}</td>
            <td>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${acc}%"></div>
                </div>
            </td>
            <td style="text-align:right;">${acc}% <span style="font-size:0.8em;color:var(--text-light);">(${stats.correct}/${stats.total})</span></td>
        `;
        tbody.appendChild(tr);
    });
}
export function closeDashboard() {
    document.getElementById('dashboard-modal').style.display = 'none';
}
export function showDataSync() {
    document.getElementById('data-modal').style.display = 'block';
    document.getElementById('data-area').value = '';
}
export function closeDataSync() {
    document.getElementById('data-modal').style.display = 'none';
}
export function downloadNotepadTxt() {
    const content = document.getElementById('notepad').value;
    if (!content) { alert('笔记为空，无法导出！'); return; }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `机设自测笔记_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function initWallpaper() {
    const savedWallpaper = localStorage.getItem(WALLPAPER_KEY);
    if (savedWallpaper) {
        applyWallpaper(savedWallpaper);
    }
}
export function applyWallpaper(url) {
    document.body.style.backgroundImage = `url('${url}')`;
    document.body.classList.add('has-wallpaper');
}
export function removeWallpaper() {
    localStorage.removeItem(WALLPAPER_KEY);
    document.body.style.backgroundImage = '';
    document.body.classList.remove('has-wallpaper');
    alert('壁纸已清除。');
}

export function handleWallpaperUpload(input) {
    const file = input.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert('图片太大了！请上传 5MB 以内的图片。');
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const image = document.getElementById('cropper-image');
        
        if (state.cropper) {
            state.cropper.destroy();
            state.cropper = null;
        }

        image.src = e.target.result;
        document.getElementById('cropper-modal').style.display = 'block';
        
        image.onload = function() {
            state.cropper = new Cropper(image, {
                aspectRatio: NaN, 
                viewMode: 1, 
                autoCropArea: 0.9,
                responsive: true,
                restore: false,
                checkCrossOrigin: false,
            });
        };
    };
    reader.readAsDataURL(file);
    input.value = '';
}
export function confirmCrop() {
    if (!state.cropper) return;
    const canvas = state.cropper.getCroppedCanvas({
        maxWidth: 1920,
        maxHeight: 1080
    });
    if (!canvas) return;

    try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        localStorage.setItem(WALLPAPER_KEY, dataUrl);
        applyWallpaper(dataUrl);
        closeCropper();
        alert('壁纸设置成功！✨');
    } catch (error) {
         alert('设置失败：裁剪后的图片可能还是太大。请尝试裁剪更小的区域。');
         console.error(error);
    }
}
export function closeCropper() {
    document.getElementById('cropper-modal').style.display = 'none';
    if (state.cropper) {
        state.cropper.destroy();
        state.cropper = null;
    }
}

export function triggerWallpaperUpload() {
    if (document.body.classList.contains('has-wallpaper')) {
        if (confirm('是否要清除当前壁纸？\\n点击[确定]清除，点击[取消]更换新壁纸。')) {
            removeWallpaper();
            return; 
        }
    }
    document.getElementById('wallpaper-upload').click();
}

export function toggleRightSidebar() {
    document.body.classList.toggle('right-sidebar-open');
    if (document.body.classList.contains('sidebar-open')) {
        document.body.classList.remove('sidebar-open');
    }
}

export function clearAllWrongAnswers() {
    if (confirm(`确定要彻底清空所有章节的错题记录吗？`)) {
        state.wrongAnswersByChapter = {};
        saveWrongAnswers();
        showAllWrongAnswers();
        updateChapterNavStatus();
    }
}

export function clearCurrentChapterWrongAnswers() {
    if (!state.activeChapter) return;
    if (confirm(`确定要清空【${state.activeChapter}】的所有错题记录吗？`)) {
        state.wrongAnswersByChapter[state.activeChapter] = [];
        saveWrongAnswers();
        showChapterWrongAnswers(state.activeChapter);
        updateChapterNavStatus();
    }
}

export function removeSingleWrongAnswer(qid, chapter, btn) {
    if (confirm('确定将此题从错题本移除？')) {
        let arr = state.wrongAnswersByChapter[chapter];
        if (arr) {
            const index = arr.indexOf(qid);
            if (index > -1) {
                arr.splice(index, 1);
                saveWrongAnswers();
            }
        }
        
        const block = btn.closest('.question-block');
        if (block) block.remove();
        
        updateChapterNavStatus();

        if (state.activeChapter === null && document.getElementById('main-title').textContent === '全局错题汇总') {
            const allWrongQids = Object.values(state.wrongAnswersByChapter).flat();
            if (allWrongQids.length === 0) {
                showAllWrongAnswers();
            }
        } else if (state.wrongAnswersByChapter[chapter] && state.wrongAnswersByChapter[chapter].length === 0) {
            showChapterWrongAnswers(chapter);
        }
    }
}

export function toggleFavorite(qid, btn) {
    const index = state.favorites.indexOf(qid);
    if (index > -1) {
        state.favorites.splice(index, 1);
        btn.classList.remove('favorited');
        btn.innerHTML = '<i class="fa-regular fa-star"></i> 收藏';
        
        if (state.activeChapter === null && state.activeType === null && document.getElementById('main-title').textContent === '我的收藏') {
            const block = btn.closest('.question-block');
            if (block) block.remove();
            if (state.favorites.length === 0) {
                 showAllFavorites();
            }
        }
    } else {
        state.favorites.push(qid);
        btn.classList.add('favorited');
        btn.innerHTML = '<i class="fa-solid fa-star"></i> 已收藏';
    }
    saveFavorites();
}

export function toggleAllAnswers() {
    const btn = document.getElementById('toggle-all-answers-btn');
    const showing = btn.textContent === '隐藏全部答案';
    
    document.querySelectorAll('.question-block.visible').forEach(block => {
        const answerSpan = block.querySelector('.answer-span');
        const explanationSpan = block.querySelector('.explanation-span');
        if (showing) {
            answerSpan.style.display = 'none';
            if (explanationSpan) explanationSpan.style.display = 'none';
        } else {
            answerSpan.style.display = 'inline';
            if (explanationSpan) {
                explanationSpan.style.display = 'block';
                typesetMath([explanationSpan]);
            }
        }
    });

    btn.textContent = showing ? '显示全部答案' : '隐藏全部答案';
}

export function toggleFavoritesView() {
    const btn = document.getElementById('toggle-favorites-btn');
    const showingOnlyFavorites = btn.textContent === '显示全部题目';
    
    document.querySelectorAll('.question-block.visible').forEach(block => {
        const qid = block.dataset.qid;
        if (showingOnlyFavorites) {
            block.style.display = 'block';
        } else {
            if (state.favorites.includes(qid)) {
                block.style.display = 'block';
            } else {
                block.style.display = 'none';
            }
        }
    });

    btn.textContent = showingOnlyFavorites ? '只显示收藏' : '显示全部题目';
}
