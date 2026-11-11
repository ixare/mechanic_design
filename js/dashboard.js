import { state } from './state.js';
import { escapeHtml, getChapterOrder } from './utils.js';
import { closeModal, openModal } from './modal.js';
import { getChapterPracticedCount, getTotalPracticedCount, getWrongAnswerQids } from './storage.js';

/**
 * 打开学习进度统计仪表盘
 */
export function showDashboard() {
    const statTotalEl = document.getElementById('stat-total');
    const statCorrectEl = document.getElementById('stat-correct');
    const statWrongEl = document.getElementById('stat-wrong-count');

    const totalAttempts = state.userStats.total;
    const totalPracticed = getTotalPracticedCount();
    if (statTotalEl) {
        statTotalEl.textContent = String(totalAttempts);
        statTotalEl.title = `覆盖 ${totalPracticed} 道去重题目`;
    }

    const rate = totalAttempts === 0 ? 0 : Math.round((state.userStats.correct / totalAttempts) * 100);
    if (statCorrectEl) {
        statCorrectEl.textContent = `${rate}%`;
        statCorrectEl.style.color = rate >= 60 ? 'var(--success)' : 'var(--error)';
    }

    const totalWrong = getWrongAnswerQids().length;
    if (statWrongEl) {
        statWrongEl.textContent = String(totalWrong);
    }

    const tbody = document.getElementById('stats-table-body');
    if (tbody) {
        tbody.innerHTML = '';
        const dashboardContent = document.querySelector('#dashboard-modal .modal-content');
        let insightBox = document.getElementById('dashboard-insights');
        if (!insightBox && dashboardContent) {
            insightBox = document.createElement('div');
            insightBox.id = 'dashboard-insights';
            const tableWrapper = tbody.closest('div');
            if (tableWrapper) {
                dashboardContent.insertBefore(insightBox, tableWrapper);
            }
        }

        const chapterRows = Object.keys(state.all_data)
            .sort((a, b) => getChapterOrder(a) - getChapterOrder(b))
            .map(chapter => {
                const stats = state.userStats.chapterStats[chapter] || { total: 0, correct: 0, practicedQids: [] };
                const acc = stats.total === 0 ? 0 : Math.round((stats.correct / stats.total) * 100);
                const totalQuestions = state.all_data[chapter].mcq.length + state.all_data[chapter].tf.length;
                const practicedUnique = getChapterPracticedCount(chapter);
                const practiced = practicedUnique > 0 || stats.total === 0
                    ? Math.min(practicedUnique, totalQuestions)
                    : Math.min(stats.total, totalQuestions);
                const completion = totalQuestions === 0 ? 0 : Math.round((practiced / totalQuestions) * 100);
                const wrongCount = getWrongAnswerQids(chapter).length;
                return { chapter, stats, acc, totalQuestions, practiced, completion, wrongCount };
            });

        const weakChapters = chapterRows
            .filter(row => row.stats.total > 0)
            .sort((a, b) => (a.acc - b.acc) || (b.wrongCount - a.wrongCount))
            .slice(0, 3);

        if (insightBox) {
            insightBox.innerHTML = weakChapters.length ? `
                <div class="dashboard-insight-card">
                    <strong>优先复习</strong>
                    <span>${weakChapters.map(row => `${escapeHtml(row.chapter)} (${row.acc}%)`).join('、')}</span>
                </div>
            ` : `
                <div class="dashboard-insight-card">
                    <strong>优先复习</strong>
                    <span>先完成一次章节或综合测试，系统会自动识别薄弱章节。</span>
                </div>
            `;
        }

        const fragment = document.createDocumentFragment();
        chapterRows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="dashboard-chapter-cell">
                        <span class="dashboard-chapter-name">${escapeHtml(row.chapter)}</span>
                        <span class="dashboard-chapter-meta">已覆盖 ${row.practiced}/${row.totalQuestions}，错题 ${row.wrongCount}</span>
                    </div>
                </td>
                <td>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${row.completion}%"></div>
                    </div>
                </td>
                <td class="dashboard-acc-cell">${row.acc}% <span class="dashboard-acc-detail">(${row.stats.correct}/${row.stats.total})</span></td>
            `;
            fragment.appendChild(tr);
        });
        tbody.appendChild(fragment);
    }

    openModal('dashboard-modal');
}

export function closeDashboard() {
    closeModal('dashboard-modal');
}
