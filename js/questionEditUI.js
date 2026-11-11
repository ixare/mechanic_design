import { state } from './state.js';
import {
    escapeAttr,
    escapeHtml,
    formatInlineHtml,
    getChapterOrder,
    showToast
} from './utils.js';
import { renderIcons } from './icons.js';
import { closeModal, confirmDialog, configureModal, openModal } from './modal.js';
import {
    copyQuestionSyncPayload,
    discardQuestionAddition,
    discardQuestionEdit,
    downloadQuestionSyncPayload,
    getQuestionEditCount,
    getQuestionSyncPayload,
    hasQuestionAddition,
    hasQuestionEdit,
    openQuestionSyncIssue,
    saveQuestionAddition,
    saveQuestionEdit
} from './questionEdits.js';
import { refreshQuestionChangeViews, refreshRenderedQuestions } from './ui.js';

const CUSTOM_CHAPTER_VALUE = '__custom_chapter__';
let returnToManagerOnClose = false;

function syncTfPickerState(pickerEl, value) {
    if (!pickerEl) return;
    const normalized = String(value || '').trim();
    pickerEl.querySelectorAll('button[data-tf-value]').forEach(btn => {
        const active = btn.dataset.tfValue === normalized;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
}

function toggleAnswerMode(type, inputEl, pickerEl) {
    if (!inputEl || !pickerEl) return;
    if (type === 'tf') {
        inputEl.style.display = 'none';
        pickerEl.style.display = 'grid';
        const val = ['✓', '×'].includes(inputEl.value.trim()) ? inputEl.value.trim() : '✓';
        inputEl.value = val;
        syncTfPickerState(pickerEl, val);
    } else {
        inputEl.style.display = 'block';
        pickerEl.style.display = 'none';
    }
}

export function bindQuestionAnswerPickers() {
    const pairs = [
        {
            input: document.getElementById('question-entry-answer'),
            picker: document.getElementById('question-entry-tf-picker')
        },
        {
            input: document.getElementById('question-edit-answer'),
            picker: document.getElementById('question-edit-tf-picker')
        }
    ];
    pairs.forEach(({ input, picker }) => {
        if (!input || !picker || picker.dataset.bound) return;
        picker.dataset.bound = 'true';
        picker.addEventListener('click', event => {
            const btn = event.target.closest('button[data-tf-value]');
            if (!btn) return;
            input.value = btn.dataset.tfValue;
            syncTfPickerState(picker, input.value);
        });
    });
}

function populateQuestionEntryChapters(selectedChapter = '') {
    const chapterSelect = document.getElementById('question-entry-chapter');
    const customChapterInput = document.getElementById('question-entry-custom-chapter');
    if (!chapterSelect || !customChapterInput) return;

    const chapters = Object.keys(state.all_data).sort((a, b) => getChapterOrder(a) - getChapterOrder(b));
    const targetChapter = selectedChapter || state.activeChapter || chapters[0] || '';
    chapterSelect.innerHTML = [
        ...chapters.map(chapter => `<option value="${escapeAttr(chapter)}">${escapeHtml(chapter)}</option>`),
        `<option value="${CUSTOM_CHAPTER_VALUE}">自定义章节...</option>`
    ].join('');

    if (chapters.includes(targetChapter)) {
        chapterSelect.value = targetChapter;
        customChapterInput.value = '';
    } else {
        chapterSelect.value = CUSTOM_CHAPTER_VALUE;
        customChapterInput.value = targetChapter;
    }
    updateQuestionEntryChapterField();
}

function getQuestionEntryChapterValue() {
    const chapterSelect = document.getElementById('question-entry-chapter');
    const customChapterInput = document.getElementById('question-entry-custom-chapter');
    if (!chapterSelect || !customChapterInput) return '';
    return chapterSelect.value === CUSTOM_CHAPTER_VALUE ? customChapterInput.value : chapterSelect.value;
}

export function updateQuestionEntryChapterField() {
    const chapterSelect = document.getElementById('question-entry-chapter');
    const customChapterInput = document.getElementById('question-entry-custom-chapter');
    if (!chapterSelect || !customChapterInput) return;

    const isCustom = chapterSelect.value === CUSTOM_CHAPTER_VALUE;
    customChapterInput.style.display = isCustom ? 'block' : 'none';
    customChapterInput.required = isCustom;
}

export function updateQuestionEntryTypeFields() {
    const type = document.getElementById('question-entry-type')?.value || 'mcq';
    const optionsField = document.getElementById('question-entry-options-field');
    const optionsInput = document.getElementById('question-entry-options');
    const answerInput = document.getElementById('question-entry-answer');
    const tfPicker = document.getElementById('question-entry-tf-picker');
    if (!optionsField || !optionsInput) return;

    if (type === 'mcq') {
        optionsField.style.display = 'grid';
    } else {
        optionsField.style.display = 'none';
        optionsInput.value = '';
    }
    toggleAnswerMode(type, answerInput, tfPicker);
}

export function openQuestionEntryModal(defaults = {}) {
    bindQuestionAnswerPickers();
    const managerModal = document.getElementById('question-edit-manager-modal');
    if (managerModal && managerModal.classList.contains('is-open')) {
        returnToManagerOnClose = true;
        closeModal('question-edit-manager-modal');
    }

    const addition = defaults || {};
    const qid = addition.qid || '';
    const type = addition.type || state.activeType || 'mcq';
    document.getElementById('question-entry-qid').value = qid;
    document.getElementById('question-entry-type').value = type;
    document.getElementById('question-entry-question').value = addition.question || '';
    document.getElementById('question-entry-options').value = Array.isArray(addition.options) ? addition.options.join('\n') : '';
    document.getElementById('question-entry-answer').value = addition.answer || (type === 'tf' ? '✓' : '');
    document.getElementById('question-entry-explanation').value = addition.explanation || '';
    document.getElementById('question-entry-title').innerHTML = qid
        ? '<i data-lucide="square-pen"></i> 编辑录入题'
        : '<i data-lucide="square-plus"></i> 录入新题';
    document.getElementById('btn-save-question-entry').innerHTML = qid
        ? '<i data-lucide="save"></i> 保存录入'
        : '<i data-lucide="square-plus"></i> 保存新题';

    populateQuestionEntryChapters(addition.chapter || state.activeChapter || '');
    updateQuestionEntryTypeFields();

    configureModal('question-entry-modal', {
        closeOnBackdrop: true,
        onAfterClose: () => {
            if (returnToManagerOnClose) {
                returnToManagerOnClose = false;
                showQuestionEditManager();
            }
        }
    });
    openModal('question-entry-modal', { focusSelector: '#question-entry-question' });
}

export function openQuestionEntryEditor(qid) {
    const addition = state.questionAdditions[qid];
    if (!addition) {
        openQuestionEditModal(qid);
        return;
    }
    openQuestionEntryModal({ ...addition, qid });
}

export function closeQuestionEntryModal() {
    closeModal('question-entry-modal');
}

export function handleQuestionEntrySubmit(event) {
    event.preventDefault();
    const qid = document.getElementById('question-entry-qid').value;
    try {
        saveQuestionAddition({
            chapter: getQuestionEntryChapterValue(),
            type: document.getElementById('question-entry-type').value,
            question: document.getElementById('question-entry-question').value,
            optionsText: document.getElementById('question-entry-options').value,
            answer: document.getElementById('question-entry-answer').value,
            explanation: document.getElementById('question-entry-explanation').value
        }, qid);
        closeQuestionEntryModal();
        refreshQuestionChangeViews();
        renderQuestionEditManager();
        showToast(qid ? '录入题已更新。' : '新题已保存并加入本地题库。', 'success');
    } catch (error) {
        showToast(error.message || '保存失败，请检查录入内容。', 'error');
    }
}

export function openQuestionEditModal(qid) {
    bindQuestionAnswerPickers();
    const question = state.question_lookup[qid];
    if (!question) return;

    const managerModal = document.getElementById('question-edit-manager-modal');
    if (managerModal && managerModal.classList.contains('is-open')) {
        returnToManagerOnClose = true;
        closeModal('question-edit-manager-modal');
    }

    document.getElementById('question-edit-qid').value = question.qid;
    document.getElementById('question-edit-question').value = question.question || '';
    document.getElementById('question-edit-answer').value = question.answer || '';
    document.getElementById('question-edit-explanation').value = question.explanation || '';

    const optionsField = document.getElementById('question-edit-options-field');
    const optionsInput = document.getElementById('question-edit-options');
    if (question.type === 'mcq') {
        optionsField.style.display = 'grid';
        optionsInput.value = (question.options || []).join('\n');
    } else {
        optionsField.style.display = 'none';
        optionsInput.value = '';
    }

    toggleAnswerMode(
        question.type,
        document.getElementById('question-edit-answer'),
        document.getElementById('question-edit-tf-picker')
    );

    document.getElementById('btn-discard-question-edit').disabled = !hasQuestionEdit(question.qid);
    configureModal('question-edit-modal', {
        closeOnBackdrop: true,
        onAfterClose: () => {
            if (returnToManagerOnClose) {
                returnToManagerOnClose = false;
                showQuestionEditManager();
            }
        }
    });
    openModal('question-edit-modal', { focusSelector: '#question-edit-question' });
}

export function closeQuestionEditModal() {
    closeModal('question-edit-modal');
}

export function handleQuestionEditSubmit(event) {
    event.preventDefault();
    const qid = document.getElementById('question-edit-qid').value;
    try {
        saveQuestionEdit(qid, {
            question: document.getElementById('question-edit-question').value,
            optionsText: document.getElementById('question-edit-options').value,
            answer: document.getElementById('question-edit-answer').value,
            explanation: document.getElementById('question-edit-explanation').value
        });
        closeQuestionEditModal();
        refreshRenderedQuestions();
        renderQuestionEditManager();
        showToast('题目修订已保存到本地。', 'success');
    } catch (error) {
        showToast(error.message || '保存失败，请检查输入内容。', 'error');
    }
}

export async function discardCurrentQuestionEdit() {
    const qid = document.getElementById('question-edit-qid').value;
    const removed = await discardQuestionEditById(qid);
    if (removed) {
        closeQuestionEditModal();
    }
}

export async function discardQuestionEditById(qid) {
    if (!qid || !hasQuestionEdit(qid)) return false;
    const confirmed = await confirmDialog({
        title: '还原题目修订',
        message: '确定要还原这道题的本地修订，恢复为原始题库内容吗？',
        confirmText: '还原原题',
        danger: true
    });
    if (!confirmed) return false;

    discardQuestionEdit(qid);
    refreshRenderedQuestions();
    renderQuestionEditManager();
    showToast('已还原为原始题目。', 'info');
    return true;
}

export async function discardQuestionAdditionById(qid) {
    if (!qid || !hasQuestionAddition(qid)) return false;
    const confirmed = await confirmDialog({
        title: '删除本地新增题',
        message: '确定要删除这道本地新增题吗？',
        confirmText: '确认删除',
        danger: true
    });
    if (!confirmed) return false;

    discardQuestionAddition(qid);
    refreshQuestionChangeViews();
    renderQuestionEditManager();
    showToast('已删除本地新增题目。', 'info');
    return true;
}

export function showQuestionEditManager() {
    returnToManagerOnClose = false;
    renderQuestionEditManager();
    openModal('question-edit-manager-modal');
}

export function closeQuestionEditManager() {
    returnToManagerOnClose = false;
    closeModal('question-edit-manager-modal');
}

export function updateQuestionEditSummary() {
    const button = document.querySelector('[data-action="showQuestionEditManager"]');
    if (!button) return;
    const count = getQuestionEditCount();
    button.innerHTML = `<i data-lucide="file-pen-line"></i> 题目修订/录入${count ? ` (${count})` : ''}`;
    renderIcons(button);
}

export function renderQuestionEditManager() {
    const summary = document.getElementById('question-edit-summary');
    const list = document.getElementById('question-edit-list');
    if (!summary || !list) return;

    const payload = getQuestionSyncPayload();
    summary.innerHTML = payload.changeCount
        ? `<strong>${payload.changeCount}</strong> 条本地题库变更，其中修订 ${payload.updateCount} 条、新增 ${payload.additionCount} 条，可申请同步到 <code>questions.js</code>。`
        : '当前没有本地题目修订或新增题。';

    if (!payload.changeCount) {
        list.innerHTML = '<div class="empty-edit-state">在题卡上点击“编辑”可修订已有题；点击“录入新题”可新增题目，都会先保存在本机。</div>';
        updateQuestionEditSummary();
        return;
    }

    list.innerHTML = payload.changes.map(change => {
        const isAddition = change.operation === 'add';
        const title = formatInlineHtml(change.updated.question);
        const typeLabel = change.type === 'mcq' ? '选择题' : '判断题';
        const operationLabel = isAddition ? '本地新增' : '本地修订';
        const editAction = isAddition ? 'openQuestionEntryEditor' : 'openQuestionEditor';
        const discardAction = isAddition ? 'discardQuestionAddition' : 'discardQuestionEdit';
        const discardLabel = isAddition ? '删除' : '还原';
        const discardIcon = isAddition ? 'trash-2' : 'rotate-ccw';
        return `
            <div class="question-edit-item">
                <div class="question-edit-item-main">
                    <span>${escapeHtml(change.chapter)} · ${typeLabel} · ${operationLabel}</span>
                    <strong>${title}</strong>
                    <small>答案：${escapeHtml(change.updated.answer)}</small>
                </div>
                <div class="question-edit-item-actions">
                    <button type="button" class="action-button" data-action="${editAction}" data-qid="${escapeAttr(change.qid)}"><i data-lucide="pen"></i> 编辑</button>
                    <button type="button" class="action-button remove-wrong-answer-btn" data-action="${discardAction}" data-qid="${escapeAttr(change.qid)}"><i data-lucide="${discardIcon}"></i> ${discardLabel}</button>
                </div>
            </div>
        `;
    }).join('');

    renderIcons(list);
    updateQuestionEditSummary();
}

export async function copyQuestionSyncRequest() {
    if (getQuestionEditCount() === 0) {
        showToast('当前没有需要同步的本地修订或新增题。', 'warning');
        return;
    }
    try {
        await copyQuestionSyncPayload();
        showToast('同步申请 JSON 已复制到剪贴板。', 'success');
    } catch (error) {
        showToast('复制失败，请改用下载同步申请。', 'error');
    }
}

export function downloadQuestionSyncRequest() {
    if (getQuestionEditCount() === 0) {
        showToast('当前没有需要同步的本地修订或新增题。', 'warning');
        return;
    }
    downloadQuestionSyncPayload();
    showToast('同步申请文件已下载。', 'success');
}

export async function openQuestionSyncRequestIssue() {
    if (getQuestionEditCount() === 0) {
        showToast('当前没有需要同步的本地修订或新增题。', 'warning');
        return;
    }
    await openQuestionSyncIssue();
}
