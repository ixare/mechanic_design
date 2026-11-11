import { state } from './state.js';
import { escapeAttr, escapeHtml, getChapterOrder } from './utils.js';
import { getLastStudyLocation, getTotalPracticedCount, getWrongAnswerQids } from './storage.js';
import { initMechanismCanvas } from './mechanism.js';
import { renderIcons } from './icons.js';

/**
 * 渲染首页概览面板与章节索引网格
 */
export function renderWelcomeOverview() {
    const welcome = document.getElementById('welcome-message');
    if (!welcome) return;

    const chapters = Object.keys(state.all_data).sort((a, b) => getChapterOrder(a) - getChapterOrder(b));
    const totalQuestions = chapters.reduce((sum, chapter) => {
        const group = state.all_data[chapter];
        return sum + group.mcq.length + group.tf.length;
    }, 0);

    const completedAttempts = state.userStats.total;
    const practicedUnique = getTotalPracticedCount();
    const displayPracticed = practicedUnique > 0 || completedAttempts === 0 ? practicedUnique : completedAttempts;
    const practicedLabel = practicedUnique > 0 || completedAttempts === 0 ? '已覆盖题数' : '累计练习';
    const accuracy = completedAttempts ? Math.round((state.userStats.correct / completedAttempts) * 100) : 0;
    const wrongCount = getWrongAnswerQids().length;
    const firstChapter = chapters.find(chapter => state.all_data[chapter].mcq.length) || chapters[0];
    const lastStudy = getLastStudyLocation();
    const hasValidLastStudy = Boolean(
        lastStudy && state.all_data[lastStudy.chapter]?.[lastStudy.type]?.length
    );
    const primaryChapter = hasValidLastStudy ? lastStudy.chapter : (firstChapter || '');
    const primaryType = hasValidLastStudy ? lastStudy.type : 'mcq';
    const primaryShortChapter = primaryChapter.replace(/^第[^章]+章\s*/, '');
    const primaryCtaText = hasValidLastStudy
        ? `继续练习：${primaryShortChapter} (${primaryType === 'mcq' ? '单选' : '判断'})`
        : '开始章节练习';
    const accuracyMetricClass = completedAttempts > 0
        ? (accuracy >= 80 ? 'metric-success' : (accuracy < 60 ? 'metric-warn' : ''))
        : '';
    const wrongMetricClass = wrongCount > 0 ? 'metric-accent' : '';

    welcome.innerHTML = `
        <section class="welcome-stage" aria-label="练习概览">
            <div class="stage-copy">
                <div>
                    <div class="stage-heading"><span>课程自测与章节题库</span></div>
                    <h2>机械设计基础</h2>
                    <p class="stage-description">收录课程各章节单选题与判断题，支持按章节顺序刷题、点击选项即时自测、错题自动归集与限时模拟考试。</p>
                    <div class="stage-actions">
                        <button type="button" class="stage-primary" data-action="showQuestions" data-chapter="${escapeAttr(primaryChapter)}" data-type="${escapeAttr(primaryType)}">${escapeHtml(primaryCtaText)} <i data-lucide="arrow-right"></i></button>
                        <button type="button" class="stage-secondary" data-action="startMockExam"><i data-lucide="timer"></i> 模拟考试</button>
                        ${wrongCount > 0 ? `<button type="button" class="stage-secondary stage-wrong-btn" data-action="showAllWrongAnswers"><i data-lucide="book-open-check"></i> 错题本 (${wrongCount})</button>` : ''}
                    </div>
                </div>
                <div class="stage-metrics">
                    <div><strong>${totalQuestions}</strong><span>题库总量</span></div>
                    <div title="累计答题 ${completedAttempts} 人次"><strong id="home-practiced-metric">${displayPracticed}</strong><span>${practicedLabel}</span></div>
                    <div><strong class="${accuracyMetricClass}">${accuracy}%</strong><span>练习正确率</span></div>
                    <div><strong class="${wrongMetricClass}">${wrongCount}</strong><span>待复习错题</span></div>
                </div>
            </div>
            <div class="mechanism-visual">
                <canvas id="mechanism-canvas" role="img" aria-label="可拖动的啮合行星齿轮示意图"></canvas>
            </div>
        </section>
        <section class="chapter-index" aria-labelledby="chapter-index-title">
            <div class="chapter-index-heading">
                <div><span class="section-kicker">课程章节</span><h2 id="chapter-index-title">按章节练习</h2></div>
                <span class="chapter-total">共 ${chapters.length} 章 · ${totalQuestions} 题</span>
            </div>
            <div class="chapter-grid">
                ${chapters.map((chapter, index) => {
                    const group = state.all_data[chapter];
                    const count = group.mcq.length + group.tf.length;
                    const chapterWrong = getWrongAnswerQids(chapter).length;
                    const isLastStudied = hasValidLastStudy && lastStudy.chapter === chapter;
                    const label = chapter.replace(/^第[^章]+章\s*/, '');
                    return `<div class="chapter-row ${isLastStudied ? 'is-last-studied' : ''}">
                        <button type="button" class="chapter-main" data-action="showQuestions" data-chapter="${escapeAttr(chapter)}" data-type="mcq" aria-label="${escapeAttr(chapter)}选择题">
                            <span class="chapter-number">${String(index + 1).padStart(2, '0')}</span>
                            <span class="chapter-name">${escapeHtml(label)}</span>
                            ${isLastStudied ? '<span class="chapter-last-pill">上次</span>' : ''}
                            ${chapterWrong > 0 ? `<span class="chapter-wrong-pill">错题 ${chapterWrong}</span>` : ''}
                            <span class="chapter-count">${count} 题</span>
                        </button>
                        <div class="chapter-row-actions">
                            <button type="button" data-action="showQuestions" data-chapter="${escapeAttr(chapter)}" data-type="mcq" title="${escapeAttr(chapter)}选择题 (${group.mcq.length}题)" aria-label="${escapeAttr(chapter)}选择题">单选</button>
                            <button type="button" data-action="showQuestions" data-chapter="${escapeAttr(chapter)}" data-type="tf" title="${escapeAttr(chapter)}判断题 (${group.tf.length}题)" aria-label="${escapeAttr(chapter)}判断题">判断</button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </section>
    `;

    renderIcons(welcome);
    initMechanismCanvas();
}
