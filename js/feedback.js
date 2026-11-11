import { copyTextToClipboard, openExternalSafe, showToast } from './utils.js';
import { closeModal, configureModal, openModal } from './modal.js';

function buildFeedbackText() {
    const type = document.getElementById('feedback-type')?.value || 'bug';
    const content = (document.getElementById('feedback-content')?.value || '').trim();
    const typeLabels = { bug: 'Bug / 题目错误', feature: '功能建议', other: '其他' };
    return `【${typeLabels[type] || '反馈'}】\n${content}`;
}

export function showFeedbackModal() {
    configureModal('feedback-modal', {
        closeOnBackdrop: true,
        onAfterClose: () => {
            const contentEl = document.getElementById('feedback-content');
            if (contentEl) contentEl.value = '';
        }
    });
    openModal('feedback-modal', { focusSelector: '#feedback-content' });
}

export function closeFeedbackModal() {
    closeModal('feedback-modal');
}

export function setupFeedbackHandlers() {
    document.getElementById('close-feedback')?.addEventListener('click', closeFeedbackModal);

    document.getElementById('btn-feedback-github')?.addEventListener('click', () => {
        const type = document.getElementById('feedback-type')?.value || 'bug';
        const content = (document.getElementById('feedback-content')?.value || '').trim();
        if (!content) {
            showToast('请先填写反馈内容。', 'warning');
            return;
        }
        const labels = { bug: 'bug', feature: 'enhancement', other: '' };
        const title = encodeURIComponent(content.slice(0, 60));
        const body = encodeURIComponent(buildFeedbackText());
        const label = labels[type] ? `&labels=${labels[type]}` : '';
        openExternalSafe(`https://github.com/ixare/mechanic_design/issues/new?title=${title}&body=${body}${label}`);
        closeFeedbackModal();
    });

    document.getElementById('btn-feedback-copy')?.addEventListener('click', async () => {
        const contentEl = document.getElementById('feedback-content');
        const content = (contentEl?.value || '').trim();
        if (!content) {
            showToast('请先填写反馈内容。', 'warning');
            return;
        }
        const copied = await copyTextToClipboard(buildFeedbackText(), contentEl);
        if (copied) {
            showToast('反馈内容已复制到剪贴板。', 'success');
        } else {
            showToast('复制失败，请手动复制输入内容。', 'error');
        }
    });
}
