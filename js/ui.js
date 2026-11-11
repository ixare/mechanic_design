import { state } from './state.js';
import {
    debounce,
    downloadBlobFile,
    escapeAttr,
    escapeHtml,
    getChapterOrder,
    showToast
} from './utils.js';
import { renderIcons } from './icons.js';
import { closeModal, confirmDialog, isAnyModalOpen, openModal } from './modal.js';
import { disposeMechanismCanvas } from './mechanism.js';
import {
    getWrongAnswerQids,
    removeWrongAnswerRecord,
    saveFavorites,
    saveLastStudyLocation,
    saveWrongAnswers,
    setPracticeTrackProgress,
    setSidebarCollapsed
} from './storage.js';
import { renderWelcomeOverview } from './home.js';
import {
    createQuestionBlock,
    jumpToQuestion,
    removeQuestionFromIndex,
    renderQuestions,
    selectPracticeOption,
    setQuestionIndexView,
    stopQuestionIndexTracking,
    syncQuestionIndexMarkers,
    syncQuestionIndexVisibility,
    toggleAllAnswers,
    toggleFavoritesView,
    toggleQuestionIndexCollapse,
    toggleSingleAnswer
} from './questionRenderer.js';

export {
    jumpToQuestion,
    renderQuestions,
    selectPracticeOption,
    setQuestionIndexView,
    toggleAllAnswers,
    toggleFavoritesView,
    toggleQuestionIndexCollapse,
    toggleSingleAnswer
};

let wrongStatusFilter = 'all';

function getSearchTerms(query) {
    return String(query || '').trim().split(/\s+/).filter(Boolean);
}

function updateWorkspacePath(text) {
    const pathEl = document.querySelector('.workspace-path');
    if (!pathEl) return;
    pathEl.textContent = text;
    pathEl.title = text;
}

export function closeChapterDrawer() {
    document.body.classList.remove('chapter-drawer-open');
    const toggleBtn = document.getElementById('chapter-drawer-toggle');
    if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.classList.remove('is-active');
    }
}

export function toggleChapterDrawer(force = null) {
    const nextOpen = force === null
        ? !document.body.classList.contains('chapter-drawer-open')
        : Boolean(force);

    if (nextOpen) {
        document.body.classList.remove('sidebar-open', 'right-sidebar-open');
        document.body.classList.add('chapter-drawer-open');
    } else {
        document.body.classList.remove('chapter-drawer-open');
    }

    const toggleBtn = document.getElementById('chapter-drawer-toggle');
    if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', String(nextOpen));
        toggleBtn.classList.toggle('is-active', nextOpen);
    }
}

export function syncDesktopSidebarButton() {
    const btn = document.getElementById('sidebar-collapse-toggle');
    if (!btn) return;
    const collapsed = document.body.classList.contains('sidebar-collapsed');
    btn.setAttribute('aria-pressed', String(collapsed));
    btn.setAttribute('aria-label', collapsed ? '展开左侧导航' : '收起左侧导航');
    btn.title = collapsed ? '展开左侧导航' : '收起左侧导航（专注刷题）';
    btn.innerHTML = collapsed
        ? '<i data-lucide="panel-left-open"></i>'
        : '<i data-lucide="panel-left-close"></i>';
    renderIcons(btn);
}

export function toggleDesktopSidebar() {
    const collapsed = !document.body.classList.contains('sidebar-collapsed');
    setSidebarCollapsed(collapsed);
    syncDesktopSidebarButton();
}

export function syncFontScaleButtons(scale) {
    document.querySelectorAll('.font-size-segmented button[data-font-scale]').forEach(btn => {
        const active = btn.dataset.fontScale === scale;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
}

function syncStickyChromeOffset() {
    const chrome = document.querySelector('.workspace-chrome');
    const topbar = chrome?.querySelector('.workspace-topbar');
    const stickyTarget = window.innerWidth > 992 ? chrome : (topbar || chrome);
    if (!stickyTarget) return;
    const height = Math.ceil(stickyTarget.getBoundingClientRect().height);
    if (height > 0) {
        document.documentElement.style.setProperty('--sticky-offset', `${height}px`);
    }
}

export function setupStickyChromeBehavior() {
    const chrome = document.querySelector('.workspace-chrome');
    if (!chrome || chrome.dataset.stickyBound) return;
    chrome.dataset.stickyBound = 'true';

    syncStickyChromeOffset();

    if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(syncStickyChromeOffset);
        observer.observe(chrome);
    }
    window.addEventListener('resize', syncStickyChromeOffset, { passive: true });

    let ticking = false;
    const syncScrollShadow = () => {
        ticking = false;
        const scrolled = window.scrollY > 8;
        chrome.classList.toggle('is-scrolled', scrolled);
        chrome.querySelector('.workspace-topbar')?.classList.toggle('is-scrolled', scrolled);
    };
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(syncScrollShadow);
    }, { passive: true });
    syncScrollShadow();
}

export function setupBackToTopButton() {
    const btn = document.getElementById('back-to-top-btn');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = 'true';

    let ticking = false;
    const updateVisibility = () => {
        ticking = false;
        btn.classList.toggle('is-visible', window.scrollY > 360);
    };
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(updateVisibility);
    }, { passive: true });

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    updateVisibility();
}

export function setupMobileMenu() {
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const notepadToggle = document.getElementById('notepad-toggle');
    const rightSidebar = document.getElementById('right-sidebar');
    const chapterDrawer = document.getElementById('chapter-drawer');
    const chapterToggle = document.getElementById('chapter-drawer-toggle');

    if (menuToggle) {
        menuToggle.addEventListener('click', e => {
            e.stopPropagation();
            document.body.classList.toggle('sidebar-open');
            document.body.classList.remove('right-sidebar-open');
            closeChapterDrawer();
        });
    }

    if (sidebar) {
        sidebar.addEventListener('click', event => {
            if (event.target.closest('button') && window.innerWidth <= 992) {
                document.body.classList.remove('sidebar-open');
            }
        });
    }

    if (chapterDrawer) {
        chapterDrawer.addEventListener('click', event => {
            if (event.target.closest('button[data-action]')) {
                closeChapterDrawer();
            }
        });
    }

    document.addEventListener('click', event => {
        const isClickInsideLeft = (sidebar && sidebar.contains(event.target)) || (menuToggle && menuToggle.contains(event.target));
        const isClickInsideRight = (rightSidebar && rightSidebar.contains(event.target)) || (notepadToggle && notepadToggle.contains(event.target));
        const isClickInsideChapters = (chapterDrawer && chapterDrawer.contains(event.target)) || (chapterToggle && chapterToggle.contains(event.target));

        if (!isClickInsideLeft && document.body.classList.contains('sidebar-open')) {
            document.body.classList.remove('sidebar-open');
        }
        if (!isClickInsideRight && document.body.classList.contains('right-sidebar-open')) {
            document.body.classList.remove('right-sidebar-open');
        }
        if (!isClickInsideChapters && document.body.classList.contains('chapter-drawer-open')) {
            closeChapterDrawer();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || isAnyModalOpen()) return;
        document.body.classList.remove('sidebar-open', 'right-sidebar-open');
        closeChapterDrawer();
    });
}

function populateSearchChapterOptions(filterBar) {
    const chapterOptions = filterBar?.querySelector('#search-chapter-options');
    if (!chapterOptions) return;

    const prevChecked = new Set(
        Array.from(chapterOptions.querySelectorAll('input[name="search-chapter"]:checked')).map(el => el.value)
    );
    const hadPrevious = chapterOptions.querySelectorAll('input[name="search-chapter"]').length > 0;

    chapterOptions.innerHTML = '';
    Object.keys(state.all_data)
        .sort((a, b) => getChapterOrder(a) - getChapterOrder(b))
        .forEach(chapterName => {
            const label = document.createElement('label');
            label.className = 'search-chapter-option';
            const checkbox = Object.assign(document.createElement('input'), {
                type: 'checkbox',
                name: 'search-chapter',
                value: chapterName,
                checked: hadPrevious ? prevChecked.has(chapterName) : true
            });
            const text = document.createElement('span');
            text.textContent = chapterName;
            label.append(checkbox, text);
            chapterOptions.appendChild(label);
        });
}

export function setupSearchFilters() {
    const searchInput = document.getElementById('global-search');
    const searchContainer = searchInput ? searchInput.closest('.search-container') : null;
    if (!searchContainer) return;

    const existing = document.getElementById('search-filter-bar');
    if (existing) {
        populateSearchChapterOptions(existing);
        return;
    }

    const filterBar = document.createElement('div');
    filterBar.id = 'search-filter-bar';
    filterBar.className = 'search-filter-bar';
    filterBar.innerHTML = `
        <div class="search-select-row">
            <select id="search-type-filter" aria-label="题型筛选">
                <option value="all">全部题型</option>
                <option value="mcq">只看选择题</option>
                <option value="tf">只看判断题</option>
            </select>
            <select id="search-scope-filter" aria-label="范围筛选">
                <option value="all">全部题目</option>
                <option value="favorites">只搜收藏</option>
                <option value="wrong">只搜错题</option>
            </select>
        </div>
        <div class="search-chapter-filter">
            <div class="search-chapter-filter-title">
                <span>章节范围</span>
                <span>
                    <button type="button" class="text-button" id="search-chapter-select-all">全选</button>
                    <button type="button" class="text-button" id="search-chapter-clear-all">清空</button>
                </span>
            </div>
            <div id="search-chapter-options" class="search-chapter-options"></div>
        </div>
    `;
    searchContainer.appendChild(filterBar);
    populateSearchChapterOptions(filterBar);

    filterBar.addEventListener('change', () => {
        filterQuestions(searchInput.value);
    });

    const searchModal = document.getElementById('search-modal');
    if (searchModal && !searchModal.dataset.searchEnterBound) {
        searchModal.dataset.searchEnterBound = 'true';
        searchModal.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.isComposing) return;
            event.preventDefault();
            filterQuestions(searchInput.value);
            closeSearchModal();
        });
    }

    filterBar.querySelector('#search-chapter-select-all')?.addEventListener('click', () => {
        filterBar.querySelectorAll('input[name="search-chapter"]').forEach(input => { input.checked = true; });
        filterQuestions(searchInput.value);
    });
    filterBar.querySelector('#search-chapter-clear-all')?.addEventListener('click', () => {
        filterBar.querySelectorAll('input[name="search-chapter"]').forEach(input => { input.checked = false; });
        filterQuestions(searchInput.value);
    });

    // 为搜索输入框绑定防抖与输入法组合保护
    let isComposing = false;
    const debouncedSearch = debounce(() => {
        filterQuestions(searchInput.value);
    }, 220);

    searchInput.addEventListener('compositionstart', () => { isComposing = true; });
    searchInput.addEventListener('compositionend', () => {
        isComposing = false;
        filterQuestions(searchInput.value);
    });
    searchInput.addEventListener('input', () => {
        if (!isComposing) debouncedSearch();
    });
}

export function updateChapterNavStatus() {
    document.querySelectorAll('#chapter-nav-list details').forEach(detail => {
        const chapterName = detail.dataset.chapterName;
        const wrongBtn = detail.querySelector('.chapter-wrong-button');
        if (!wrongBtn) return;
        const wrongCount = getWrongAnswerQids(chapterName).length;
        if (wrongCount > 0) {
            wrongBtn.textContent = `本章错题 (${wrongCount})`;
            wrongBtn.disabled = false;
        } else {
            wrongBtn.textContent = '本章错题 (0)';
            wrongBtn.disabled = true;
        }
    });
    syncQuestionIndexMarkers();
}

export function updatePracticeTrackButton() {
    const btn = document.getElementById('toggle-practice-track-btn');
    if (!btn) return;
    btn.textContent = state.practiceTrackProgress ? '练习记录进度：开' : '练习记录进度：关';
    btn.setAttribute('aria-pressed', String(state.practiceTrackProgress));
    btn.classList.toggle('is-active-toggle', state.practiceTrackProgress);
}

export function togglePracticeTrackProgress() {
    setPracticeTrackProgress(!state.practiceTrackProgress);
    updatePracticeTrackButton();
    showToast(
        state.practiceTrackProgress
            ? '已开启：章节列表直点作答将自动计入学习统计与错题本。'
            : '已关闭：章节列表直点作答仅作自测参考，不计入统计与错题本。',
        'info'
    );
}

export function togglePendingWrongView() {
    wrongStatusFilter = wrongStatusFilter === 'pending' ? 'all' : 'pending';
    const btn = document.getElementById('toggle-pending-wrong-btn');
    if (btn) {
        btn.textContent = wrongStatusFilter === 'pending' ? '显示全部错题' : '只看未掌握';
        btn.setAttribute('aria-pressed', String(wrongStatusFilter === 'pending'));
    }

    if (state.activeView === 'chapter-wrong' && state.activeChapter) {
        showChapterWrongAnswers(state.activeChapter, state.activeChapterButton);
    } else if (state.activeView === 'all-wrong') {
        showAllWrongAnswers();
    }
}

export function updateGlobalControls(show, options = {}) {
    if (show) {
        document.body.classList.remove('home-view');
        disposeMechanismCanvas();
    }
    const controls = document.getElementById('global-controls');
    if (controls) controls.style.display = show ? 'flex' : 'none';
    if (!show) {
        requestAnimationFrame(syncStickyChromeOffset);
        return;
    }

    const toggleIds = [
        'toggle-favorites-btn',
        'clear-chapter-wrong-answers-btn',
        'test-chapter-wrong-btn',
        'test-all-wrong-btn',
        'clear-all-wrong-answers-btn',
        'toggle-pending-wrong-btn',
        'toggle-practice-track-btn'
    ];
    toggleIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    if (options.showFavoriteFilter) document.getElementById('toggle-favorites-btn').style.display = 'inline-flex';
    if (options.showChapterWrongClear) document.getElementById('clear-chapter-wrong-answers-btn').style.display = 'inline-flex';
    if (options.showChapterWrongTest) document.getElementById('test-chapter-wrong-btn').style.display = 'inline-flex';
    if (options.showAllWrongClear) document.getElementById('clear-all-wrong-answers-btn').style.display = 'inline-flex';
    if (options.showAllWrongTest) document.getElementById('test-all-wrong-btn').style.display = 'inline-flex';
    if (options.showPendingWrongFilter) {
        const pendingBtn = document.getElementById('toggle-pending-wrong-btn');
        if (pendingBtn) {
            pendingBtn.style.display = 'inline-flex';
            pendingBtn.textContent = wrongStatusFilter === 'pending' ? '显示全部错题' : '只看未掌握';
            pendingBtn.setAttribute('aria-pressed', String(wrongStatusFilter === 'pending'));
        }
    }
    if (options.showPracticeTrack) {
        const trackBtn = document.getElementById('toggle-practice-track-btn');
        if (trackBtn) {
            trackBtn.style.display = 'inline-flex';
            updatePracticeTrackButton();
        }
    }

    const answerBtn = document.getElementById('toggle-all-answers-btn');
    const favoriteBtn = document.getElementById('toggle-favorites-btn');
    if (answerBtn) {
        answerBtn.textContent = '显示全部答案';
        answerBtn.dataset.state = 'hidden';
    }
    if (favoriteBtn) {
        favoriteBtn.textContent = '只显示收藏';
        favoriteBtn.dataset.state = 'all';
    }
    requestAnimationFrame(syncStickyChromeOffset);
}

export function buildChapterNavigation() {
    const chapterNavList = document.getElementById('chapter-nav-list');
    if (!chapterNavList) return;
    chapterNavList.innerHTML = '';

    const fragment = document.createDocumentFragment();
    Object.keys(state.all_data)
        .sort((a, b) => getChapterOrder(a) - getChapterOrder(b))
        .forEach(chapterName => {
            const details = document.createElement('details');
            details.dataset.chapterName = chapterName;

            const summary = document.createElement('summary');
            summary.textContent = chapterName;
            const chevron = document.createElement('i');
            chevron.dataset.lucide = 'chevron-right';
            chevron.className = 'chapter-chevron';
            summary.appendChild(chevron);
            details.appendChild(summary);

            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'chapter-button-container';

            const wrongBtn = document.createElement('button');
            wrongBtn.type = 'button';
            wrongBtn.className = 'chapter-wrong-button';
            wrongBtn.dataset.chapter = chapterName;
            wrongBtn.dataset.action = 'showChapterWrongAnswers';
            buttonContainer.appendChild(wrongBtn);

            const mcqBtn = document.createElement('button');
            mcqBtn.type = 'button';
            mcqBtn.className = 'chapter-type-button';
            mcqBtn.innerHTML = '<i data-lucide="list"></i> 选择题';
            mcqBtn.dataset.chapter = chapterName;
            mcqBtn.dataset.type = 'mcq';
            mcqBtn.dataset.action = 'showQuestions';
            buttonContainer.appendChild(mcqBtn);

            const tfBtn = document.createElement('button');
            tfBtn.type = 'button';
            tfBtn.className = 'chapter-type-button';
            tfBtn.innerHTML = '<i data-lucide="check-check"></i> 判断题';
            tfBtn.dataset.chapter = chapterName;
            tfBtn.dataset.type = 'tf';
            tfBtn.dataset.action = 'showQuestions';
            buttonContainer.appendChild(tfBtn);

            const testBtn = document.createElement('button');
            testBtn.type = 'button';
            testBtn.className = 'chapter-test-button';
            testBtn.innerHTML = '<i data-lucide="flask-conical"></i> 本章测试';
            testBtn.dataset.chapter = chapterName;
            testBtn.dataset.action = 'startChapterTest';
            buttonContainer.appendChild(testBtn);

            details.appendChild(buttonContainer);
            fragment.appendChild(details);
        });

    chapterNavList.appendChild(fragment);
    renderIcons(chapterNavList);
    updateChapterNavStatus();
}

export function createNavigationAndContent() {
    const contentArea = document.getElementById('content-area');
    if (contentArea) contentArea.innerHTML = '';
    buildChapterNavigation();
    showHome();
}

export function showHome() {
    stopQuestionIndexTracking();
    state.activeView = 'home';
    state.activeChapter = null;
    state.activeType = null;
    if (state.activeChapterButton) {
        state.activeChapterButton.classList.remove('active');
        state.activeChapterButton = null;
    }

    const searchInput = document.getElementById('global-search');
    if (searchInput) searchInput.value = '';
    const typeFilter = document.getElementById('search-type-filter');
    const scopeFilter = document.getElementById('search-scope-filter');
    if (typeFilter) typeFilter.value = 'all';
    if (scopeFilter) scopeFilter.value = 'all';
    document.querySelectorAll('input[name="search-chapter"]').forEach(input => { input.checked = true; });

    const mainTitle = document.getElementById('main-title');
    if (mainTitle) mainTitle.textContent = '机械设计基础';
    updateWorkspacePath('机械设计基础 · 课程复习题库');
    const contentArea = document.getElementById('content-area');
    if (contentArea) contentArea.innerHTML = '';
    const welcome = document.getElementById('welcome-message');
    if (welcome) welcome.style.display = 'block';

    updateGlobalControls(false);
    document.body.classList.add('home-view');
    renderWelcomeOverview();
    document.body.classList.remove('sidebar-open');
    window.scrollTo(0, 0);
}

function findChapterTypeButton(chapter, type) {
    return Array.from(document.querySelectorAll('#chapter-nav-list [data-action="showQuestions"]'))
        .find(button => button.dataset.chapter === chapter && button.dataset.type === type) || null;
}

function findChapterWrongButton(chapter) {
    return Array.from(document.querySelectorAll('#chapter-nav-list [data-action="showChapterWrongAnswers"]'))
        .find(button => button.dataset.chapter === chapter) || null;
}

export function showQuestions(chapter, type, btn = null) {
    window.scrollTo(0, 0);
    state.activeView = 'chapter';
    state.activeChapter = chapter;
    state.activeType = type;

    const welcome = document.getElementById('welcome-message');
    if (welcome) welcome.style.display = 'none';
    updateGlobalControls(true, { showFavoriteFilter: true, showPracticeTrack: true });

    const mainTitle = document.getElementById('main-title');
    const typeLabel = type === 'mcq' ? '选择题' : '判断题';
    if (mainTitle) mainTitle.textContent = `${chapter} - ${typeLabel}`;
    updateWorkspacePath(`${chapter} · ${typeLabel}`);
    saveLastStudyLocation(chapter, type);

    if (state.activeChapterButton) state.activeChapterButton.classList.remove('active');
    const resolvedBtn = btn || findChapterTypeButton(chapter, type);
    if (resolvedBtn) {
        resolvedBtn.classList.add('active');
        state.activeChapterButton = resolvedBtn;
        const parentDetails = resolvedBtn.closest('details');
        if (parentDetails) parentDetails.open = true;
    }

    const chapterBucket = state.all_data[chapter];
    const questionsPool = chapterBucket ? (type === 'mcq' ? chapterBucket.mcq : chapterBucket.tf) : [];
    renderQuestions(questionsPool, { mode: 'practice' });
}

export function showChapterWrongAnswers(chapterName, btn = null) {
    window.scrollTo(0, 0);
    state.activeView = 'chapter-wrong';
    state.activeChapter = chapterName;
    state.activeType = null;

    const welcome = document.getElementById('welcome-message');
    if (welcome) welcome.style.display = 'none';
    updateGlobalControls(true, {
        showChapterWrongClear: true,
        showChapterWrongTest: true,
        showPendingWrongFilter: true
    });

    if (state.activeChapterButton) state.activeChapterButton.classList.remove('active');
    const resolvedBtn = btn || findChapterWrongButton(chapterName);
    if (resolvedBtn) {
        resolvedBtn.classList.add('active');
        state.activeChapterButton = resolvedBtn;
    }

    const mainTitle = document.getElementById('main-title');
    if (mainTitle) mainTitle.textContent = `${chapterName} - 错题回顾`;
    updateWorkspacePath(`${chapterName} · 错题回顾`);

    const allChapterWrong = getWrongAnswerQids(chapterName);
    const filteredWrong = getWrongAnswerQids(chapterName, { status: wrongStatusFilter });
    const questionsList = filteredWrong.map(qid => state.question_lookup[qid]).filter(Boolean);
    renderQuestions(questionsList, { mode: 'wrong' });

    if (questionsList.length === 0) {
        updateGlobalControls(false);
        document.body.classList.remove('home-view');
        const contentArea = document.getElementById('content-area');
        if (contentArea) contentArea.innerHTML = '';
        if (welcome) {
            welcome.style.display = 'block';
            welcome.innerHTML = allChapterWrong.length > 0 && wrongStatusFilter === 'pending'
                ? '<p class="empty-view-message">本章错题均已达标掌握，可点击上方“显示全部错题”或从“章节目录”切换章节。</p>'
                : '<p class="empty-view-message">本章没有错题记录，继续保持！</p>';
        }
    }
}

export function showAllWrongAnswers() {
    window.scrollTo(0, 0);
    state.activeView = 'all-wrong';
    state.activeChapter = null;
    state.activeType = null;

    const welcome = document.getElementById('welcome-message');
    if (welcome) welcome.style.display = 'none';
    updateGlobalControls(true, {
        showAllWrongClear: true,
        showAllWrongTest: true,
        showPendingWrongFilter: true
    });

    const mainTitle = document.getElementById('main-title');
    if (mainTitle) mainTitle.textContent = '全局错题汇总';
    updateWorkspacePath('全局错题汇总');

    if (state.activeChapterButton) {
        state.activeChapterButton.classList.remove('active');
        state.activeChapterButton = null;
    }

    const allWrong = getWrongAnswerQids();
    const filteredWrong = getWrongAnswerQids(null, { status: wrongStatusFilter });
    const questionsList = filteredWrong.map(qid => state.question_lookup[qid]).filter(Boolean);
    renderQuestions(questionsList, { mode: 'wrong' });

    if (questionsList.length === 0) {
        updateGlobalControls(false);
        document.body.classList.remove('home-view');
        const contentArea = document.getElementById('content-area');
        if (contentArea) contentArea.innerHTML = '';
        if (welcome) {
            welcome.style.display = 'block';
            welcome.innerHTML = allWrong.length > 0 && wrongStatusFilter === 'pending'
                ? '<p class="empty-view-message">所有错题均已掌握！</p>'
                : '<p class="empty-view-message">太棒了！您当前没有任何错题记录。</p>';
        }
    }
}

export function showAllFavorites() {
    window.scrollTo(0, 0);
    state.activeView = 'favorites';
    state.activeChapter = null;
    state.activeType = null;

    const welcome = document.getElementById('welcome-message');
    if (welcome) welcome.style.display = 'none';
    updateGlobalControls(true);

    const mainTitle = document.getElementById('main-title');
    if (mainTitle) mainTitle.textContent = '我的收藏';
    updateWorkspacePath('我的收藏');

    if (state.activeChapterButton) {
        state.activeChapterButton.classList.remove('active');
        state.activeChapterButton = null;
    }

    const favQuestions = state.favorites.map(qid => state.question_lookup[qid]).filter(Boolean);
    renderQuestions(favQuestions, { mode: 'favorites' });

    if (favQuestions.length === 0) {
        updateGlobalControls(false);
        document.body.classList.remove('home-view');
        const contentArea = document.getElementById('content-area');
        if (contentArea) contentArea.innerHTML = '';
        if (welcome) {
            welcome.style.display = 'block';
            welcome.innerHTML = '<p class="empty-view-message">你还没有收藏任何题目。</p>';
        }
    }
}

export function filterQuestions(query) {
    const rawQuery = String(query ?? '');
    const searchTerm = rawQuery.trim().toLowerCase();
    const terms = getSearchTerms(searchTerm);
    const typeFilter = document.getElementById('search-type-filter')?.value || 'all';
    const scopeFilter = document.getElementById('search-scope-filter')?.value || 'all';
    const chapterInputs = Array.from(document.querySelectorAll('input[name="search-chapter"]'));
    const selectedChapters = chapterInputs.filter(input => input.checked).map(input => input.value);
    const chapterFilterActive = chapterInputs.length > 0 && selectedChapters.length !== chapterInputs.length;
    const selectedChapterSet = new Set(selectedChapters);
    const hasActiveSearch = searchTerm.length > 0
        || typeFilter !== 'all'
        || scopeFilter !== 'all'
        || chapterFilterActive;

    if (state.activeChapterButton) {
        state.activeChapterButton.classList.remove('active');
        state.activeChapterButton = null;
    }

    if (!hasActiveSearch) {
        showHome();
        return;
    }

    state.activeView = 'search';
    state.activeChapter = null;
    state.activeType = null;

    const welcome = document.getElementById('welcome-message');
    if (welcome) welcome.style.display = 'none';
    updateGlobalControls(true, { showFavoriteFilter: true, showPracticeTrack: true });

    const mainTitle = document.getElementById('main-title');
    if (mainTitle) {
        mainTitle.textContent = searchTerm.length > 0 ? `搜索结果: "${rawQuery.trim()}"` : '筛选结果';
    }
    updateWorkspacePath(searchTerm.length > 0 ? `检索 · ${rawQuery.trim()}` : '题库筛选结果');

    // 在循环外预处理 Set，避免 O(N^2) 重复扫描错题和收藏数组
    const favoriteSet = new Set(state.favorites);
    const wrongSet = new Set(getWrongAnswerQids());
    const allQuestions = [...(globalThis.mcq_data || []), ...(globalThis.tf_data || [])];

    const filtered = allQuestions.filter(q => {
        if (typeFilter !== 'all' && q.type !== typeFilter) return false;
        if (scopeFilter === 'favorites' && !favoriteSet.has(q.qid)) return false;
        if (scopeFilter === 'wrong' && !wrongSet.has(q.qid)) return false;
        if (chapterFilterActive && !selectedChapterSet.has(q.chapter)) return false;

        if (terms.length === 0) return true;
        const itemText = q._searchText || `${q.question || ''} ${(q.options || []).join(' ')} ${q.answer || ''} ${q.explanation || ''}`.toLowerCase();
        return terms.every(term => itemText.includes(term));
    });

    renderQuestions(filtered, {
        searchTerms: terms,
        mode: scopeFilter === 'wrong' ? 'wrong' : 'search'
    });

    if (filtered.length === 0) {
        updateGlobalControls(false);
        document.body.classList.remove('home-view');
        const contentArea = document.getElementById('content-area');
        if (contentArea) contentArea.innerHTML = '';
        if (welcome) {
            welcome.style.display = 'block';
            welcome.innerHTML = searchTerm.length > 0
                ? `<p class="empty-view-message">未找到包含 "${escapeHtml(rawQuery.trim())}" 的题目。</p>`
                : '<p class="empty-view-message">未找到符合当前筛选条件的题目。</p>';
        }
    }
}

export function refreshRenderedQuestions() {
    if (!state.currentQuestionList.length) return;
    const validList = state.currentQuestionList.filter(q => Boolean(state.question_lookup[q.qid]));
    renderQuestions(validList, state.currentRenderOptions);
}

/**
 * 在本地修订、新增、删除题目或导入备份后，保持当前所在视图状态刷新页面
 */
export function refreshQuestionChangeViews() {
    const prevView = state.activeView;
    const prevChapter = state.activeChapter;
    const prevType = state.activeType;

    buildChapterNavigation();
    setupSearchFilters();

    if (prevView === 'chapter' && prevChapter && prevType && state.all_data[prevChapter]) {
        showQuestions(prevChapter, prevType);
        return;
    }
    if (prevView === 'chapter-wrong' && prevChapter && state.all_data[prevChapter]) {
        showChapterWrongAnswers(prevChapter);
        return;
    }
    if (prevView === 'all-wrong') {
        showAllWrongAnswers();
        return;
    }
    if (prevView === 'favorites') {
        showAllFavorites();
        return;
    }
    if (prevView === 'search') {
        filterQuestions(document.getElementById('global-search')?.value || '');
        return;
    }

    showHome();
}

export function openSearchModal() {
    openModal('search-modal', { focusSelector: '#global-search' });
}

export function closeSearchModal() {
    closeModal('search-modal');
}

export function showDataSync() {
    const area = document.getElementById('data-area');
    if (area) area.value = '';
    openModal('data-modal', { focusSelector: '#data-area' });
}

export function closeDataSync() {
    closeModal('data-modal');
}

export function downloadNotepadTxt() {
    const content = document.getElementById('notepad')?.value || '';
    if (!content.trim()) {
        showToast('笔记为空，无法导出。', 'warning');
        return;
    }
    downloadBlobFile(
        `机设自测笔记_${new Date().toISOString().slice(0, 10)}.txt`,
        content,
        'text/plain;charset=utf-8'
    );
    showToast('笔记已导出为 TXT 文件。', 'success');
}

export function toggleRightSidebar() {
    document.body.classList.toggle('right-sidebar-open');
    if (document.body.classList.contains('sidebar-open')) {
        document.body.classList.remove('sidebar-open');
    }
    closeChapterDrawer();
}

export async function clearAllWrongAnswers() {
    const confirmed = await confirmDialog({
        title: '清空所有错题',
        message: '确定要彻底清空所有章节的错题记录吗？此操作不可撤销。',
        confirmText: '确认清空',
        danger: true
    });
    if (!confirmed) return;

    state.wrongAnswersByChapter = {};
    saveWrongAnswers();
    showAllWrongAnswers();
    updateChapterNavStatus();
    showToast('已清空所有错题记录。', 'success');
}

export async function clearCurrentChapterWrongAnswers() {
    if (!state.activeChapter) return;
    const confirmed = await confirmDialog({
        title: '清空本章错题',
        message: `确定要清空【${state.activeChapter}】的所有错题记录吗？`,
        confirmText: '确认清空',
        danger: true
    });
    if (!confirmed) return;

    delete state.wrongAnswersByChapter[state.activeChapter];
    saveWrongAnswers();
    showChapterWrongAnswers(state.activeChapter);
    updateChapterNavStatus();
    showToast(`已清空【${state.activeChapter}】错题。`, 'success');
}

export async function removeSingleWrongAnswer(qid, chapter, btn) {
    const confirmed = await confirmDialog({
        title: '移除错题',
        message: '确定将此题从错题本移除？',
        confirmText: '移除',
        danger: true
    });
    if (!confirmed) return;

    removeWrongAnswerRecord(chapter, qid);
    saveWrongAnswers();

    const block = btn?.closest('.question-block');
    if (block) block.remove();
    removeQuestionFromIndex(qid);
    updateChapterNavStatus();

    if (state.activeView === 'all-wrong' && getWrongAnswerQids().length === 0) {
        showAllWrongAnswers();
    } else if (state.activeView === 'chapter-wrong' && getWrongAnswerQids(chapter).length === 0) {
        showChapterWrongAnswers(chapter);
    }
    showToast('已从错题本移除。', 'info');
}

export function toggleFavorite(qid, btn) {
    if (!qid || !btn) return;
    const index = state.favorites.indexOf(qid);
    if (index > -1) {
        state.favorites.splice(index, 1);
        btn.classList.remove('favorited');
        btn.innerHTML = '<i data-lucide="star"></i> 收藏';
        renderIcons(btn);

        if (state.activeView === 'favorites') {
            const block = btn.closest('.question-block');
            if (block) block.remove();
            removeQuestionFromIndex(qid);
            if (state.favorites.length === 0) {
                showAllFavorites();
            }
        } else if (document.getElementById('toggle-favorites-btn')?.dataset.state === 'favorites') {
            const block = btn.closest('.question-block');
            if (block) block.style.display = 'none';
            syncQuestionIndexVisibility();
        }
    } else {
        state.favorites.push(qid);
        btn.classList.add('favorited');
        btn.innerHTML = '<i data-lucide="star"></i> 已收藏';
        renderIcons(btn);
    }
    saveFavorites();
    syncQuestionIndexMarkers();
}
