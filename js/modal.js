import { escapeHtml } from './utils.js';
import { renderIcons } from './icons.js';

const modalStack = [];
const modalConfigs = new Map();
let globalListenersBound = false;

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    'summary'
].join(', ');

function getFocusableElements(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(el => {
        if (el.closest('[hidden]')) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    });
}

function bindGlobalModalListeners() {
    if (globalListenersBound || typeof document === 'undefined') return;
    globalListenersBound = true;

    document.addEventListener('keydown', event => {
        if (modalStack.length === 0) return;
        const topEntry = modalStack[modalStack.length - 1];
        const modal = document.getElementById(topEntry.id);
        if (!modal) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            requestCloseModal(topEntry.id);
            return;
        }

        if (event.key === 'Tab') {
            const focusable = getFocusableElements(modal);
            if (focusable.length === 0) {
                event.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
                event.preventDefault();
                first.focus();
            }
        }
    });
}

/**
 * 注册弹窗配置（遮罩关闭策略、关闭前拦截与关闭后回调）
 */
export function configureModal(id, config = {}) {
    modalConfigs.set(id, {
        closeOnBackdrop: config.closeOnBackdrop !== false,
        closeOnEscape: config.closeOnEscape !== false,
        onBeforeClose: config.onBeforeClose || null,
        onAfterClose: config.onAfterClose || null
    });

    const modal = document.getElementById(id);
    if (modal && !modal.dataset.modalConfigured) {
        modal.dataset.modalConfigured = 'true';
        if (!modal.hasAttribute('role')) modal.setAttribute('role', 'dialog');
        if (!modal.hasAttribute('aria-modal')) modal.setAttribute('aria-modal', 'true');
        modal.addEventListener('click', event => {
            if (event.target !== modal) return;
            const currentConfig = modalConfigs.get(id);
            if (!currentConfig || currentConfig.closeOnBackdrop) {
                requestCloseModal(id);
            }
        });
    }
}

/**
 * 打开指定弹窗并记录焦点上下文
 */
export function openModal(id, options = {}) {
    bindGlobalModalListeners();
    const modal = document.getElementById(id);
    if (!modal) return;

    if (!modal.dataset.modalConfigured) {
        configureModal(id, options);
    }

    const existingIndex = modalStack.findIndex(item => item.id === id);
    if (existingIndex !== -1) {
        modalStack.splice(existingIndex, 1);
    }

    const returnFocusTo = options.returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    modalStack.push({ id, returnFocusTo });

    if (!modal.hasAttribute('role')) modal.setAttribute('role', 'dialog');
    if (!modal.hasAttribute('aria-modal')) modal.setAttribute('aria-modal', 'true');
    const heading = modal.querySelector('h2, h3');
    if (heading && !modal.hasAttribute('aria-labelledby')) {
        if (!heading.id) heading.id = `${id}-heading`;
        modal.setAttribute('aria-labelledby', heading.id);
    }

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    renderIcons(modal);

    requestAnimationFrame(() => {
        if (!modal.classList.contains('is-open')) return;
        let focusTarget = options.focusSelector ? modal.querySelector(options.focusSelector) : null;
        if (!focusTarget) {
            const focusables = getFocusableElements(modal);
            focusTarget = focusables.find(el => !el.classList.contains('close-modal') && el.id !== 'close-quiz') || focusables[0];
        }
        if (focusTarget && typeof focusTarget.focus === 'function') {
            focusTarget.focus();
        }
    });
}

/**
 * 同步关闭指定弹窗并恢复焦点
 */
export function closeModal(id) {
    const modal = document.getElementById(id);
    const stackIndex = modalStack.findIndex(item => item.id === id);
    const entry = stackIndex !== -1 ? modalStack.splice(stackIndex, 1)[0] : null;

    if (modal) {
        modal.classList.remove('is-open');
        modal.style.display = '';
        modal.setAttribute('aria-hidden', 'true');
    }

    if (modalStack.length === 0) {
        document.body.classList.remove('modal-open');
    }

    const config = modalConfigs.get(id);
    if (config?.onAfterClose) {
        config.onAfterClose();
    }

    if (entry?.returnFocusTo && document.contains(entry.returnFocusTo) && modalStack.length === 0) {
        entry.returnFocusTo.focus();
    }
}

/**
 * 请求关闭弹窗（支持异步关闭前确认拦截）
 */
export async function requestCloseModal(id) {
    const config = modalConfigs.get(id);
    if (config?.onBeforeClose) {
        const allow = await config.onBeforeClose();
        if (!allow) return false;
    }
    closeModal(id);
    return true;
}

export function isModalOpen(id) {
    const modal = document.getElementById(id);
    return Boolean(modal && modal.classList.contains('is-open'));
}

export function isAnyModalOpen() {
    return modalStack.length > 0;
}

function ensureConfirmModal() {
    let modal = document.getElementById('app-confirm-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'app-confirm-modal';
    modal.className = 'modal confirm-modal';
    modal.innerHTML = `
        <div class="modal-content confirm-modal-panel">
            <h2 id="app-confirm-title"><i data-lucide="circle-help"></i> <span>确认操作</span></h2>
            <p id="app-confirm-message" class="confirm-modal-message"></p>
            <div id="app-confirm-actions" class="question-edit-actions"></div>
        </div>
    `;
    document.body.appendChild(modal);
    configureModal('app-confirm-modal', { closeOnBackdrop: true });
    return modal;
}

/**
 * 主题化非阻塞确认对话框（替代原生 window.confirm）
 */
export function confirmDialog({
    title = '确认操作',
    message = '',
    confirmText = '确定',
    cancelText = '取消',
    danger = false,
    extraText = ''
} = {}) {
    const modal = ensureConfirmModal();
    const titleEl = modal.querySelector('#app-confirm-title span');
    const messageEl = modal.querySelector('#app-confirm-message');
    const actionsEl = modal.querySelector('#app-confirm-actions');

    titleEl.textContent = title;
    messageEl.textContent = message;

    return new Promise(resolve => {
        let settled = false;
        const finish = result => {
            if (settled) return;
            settled = true;
            configureModal('app-confirm-modal', { closeOnBackdrop: true });
            closeModal('app-confirm-modal');
            resolve(result);
        };

        configureModal('app-confirm-modal', {
            closeOnBackdrop: true,
            onAfterClose: () => {
                if (!settled) {
                    settled = true;
                    resolve(false);
                }
            }
        });

        actionsEl.innerHTML = `
            <button type="button" class="action-button subtle-button" data-confirm-choice="cancel">${escapeHtml(cancelText)}</button>
            ${extraText ? `<button type="button" class="action-button" data-confirm-choice="extra">${escapeHtml(extraText)}</button>` : ''}
            <button type="button" class="${danger ? 'action-button danger-button' : 'quiz-button'}" data-confirm-choice="confirm">${escapeHtml(confirmText)}</button>
        `;

        actionsEl.querySelector('[data-confirm-choice="cancel"]').addEventListener('click', () => finish(false));
        actionsEl.querySelector('[data-confirm-choice="extra"]')?.addEventListener('click', () => finish('extra'));
        actionsEl.querySelector('[data-confirm-choice="confirm"]').addEventListener('click', () => finish(true));

        openModal('app-confirm-modal', {
            focusSelector: '[data-confirm-choice="confirm"]'
        });
    });
}
