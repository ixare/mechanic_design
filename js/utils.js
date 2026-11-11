const MATH_SEGMENT_REGEX = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$[^$\n]+?(?<!\\)\$)/g;

/**
 * 防抖函数：延迟高频回调执行
 */
export function debounce(func, wait = 200) {
    let timeout = null;
    return function (...args) {
        const later = () => {
            timeout = null;
            func.apply(this, args);
        };
        if (timeout !== null) clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 转义 HTML 特殊字符，防止标签吞噬与 XSS
 */
export function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

/**
 * 转义 HTML 属性值
 */
export function escapeAttr(text) {
    return escapeHtml(text);
}

/**
 * 转义正则表达式元字符
 */
export function escapeRegExp(text) {
    return String(text ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 将题干中的空括号统一替换为可读填空占位符
 */
export function replaceBlankPlaceholders(text) {
    return String(text ?? '').replace(/(\(|\（)\s*(\)|\）)/g, ' (   ) ');
}

/**
 * 提取题干纯摘要文本（去除题号前缀与空白）
 */
export function stripQuestionNumber(text) {
    return String(text ?? '').replace(/^\s*\d+\s*[、.．]\s*/, '').replace(/\s+/g, ' ').trim();
}

/**
 * 解析选择题选项的字母键值与正文
 */
export function parseMcqOption(rawOption) {
    const trimmed = String(rawOption ?? '').trim();
    const match = trimmed.match(/^([A-Za-z])(?:[.\uFF0E\u3001:：\)\uFF09\s]+(.*))?$/s);
    if (match) {
        return {
            key: match[1].toUpperCase(),
            text: (match[2] ?? '').trim()
        };
    }
    return { key: '', text: trimmed };
}

/**
 * 高亮纯文本片段并执行 HTML 转义，不破坏标签或数学公式
 */
function highlightAndEscapePlainText(segment, terms = []) {
    const validTerms = terms.filter(Boolean);
    if (validTerms.length === 0) {
        return escapeHtml(segment);
    }

    const pattern = new RegExp(`(${validTerms.map(escapeRegExp).join('|')})`, 'gi');
    const parts = segment.split(pattern);
    return parts.map((part, idx) => {
        if (!part) return '';
        const escaped = escapeHtml(part);
        return idx % 2 === 1 ? `<mark class="search-highlight">${escaped}</mark>` : escaped;
    }).join('');
}

/**
 * 安全格式化行内题干与选项：保护 $...$ / \(...\) 公式中的 <、> 等字符，并执行关键词高亮
 */
export function formatInlineHtml(text, terms = []) {
    const normalized = replaceBlankPlaceholders(text);
    const segments = normalized.split(MATH_SEGMENT_REGEX);
    return segments.map((segment, index) => {
        if (!segment) return '';
        // 奇数位命中数学公式分组：仅做 HTML 实体转义以确保文本节点内保留原始 <、>、& 给 MathJax
        if (index % 2 === 1) {
            return escapeHtml(segment);
        }
        return highlightAndEscapePlainText(segment, terms);
    }).join('');
}

/**
 * 安全渲染解析 Markdown：先提取保护数学公式块避免 marked 误解析 * / _，再经 DOMPurify 清洗后还原
 */
export function renderMarkdown(text) {
    const source = String(text ?? '').trim();
    if (!source) return '';

    const mathTokens = [];
    const protectedText = source.replace(MATH_SEGMENT_REGEX, match => {
        const token = `MECHMATHTOKEN${mathTokens.length}END`;
        mathTokens.push(match);
        return token;
    });

    let html = protectedText;
    if (typeof globalThis.marked !== 'undefined' && typeof globalThis.marked.parse === 'function') {
        html = globalThis.marked.parse(protectedText);
    } else {
        html = escapeHtml(protectedText).replace(/\r?\n/g, '<br>');
    }

    if (typeof globalThis.DOMPurify !== 'undefined' && typeof globalThis.DOMPurify.sanitize === 'function') {
        html = globalThis.DOMPurify.sanitize(html);
    }

    return html.replace(/MECHMATHTOKEN(\d+)END/g, (_, idx) => escapeHtml(mathTokens[Number(idx)] ?? ''));
}

/**
 * 解析章节序号以便排序（支持中文数字一~九十九及阿拉伯数字）
 */
export function getChapterOrder(chapterName) {
    const match = String(chapterName ?? '').match(/第(\S+)章/);
    if (!match) return Number.MAX_SAFE_INTEGER;
    const raw = match[1];
    const numberMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (/^\d+$/.test(raw)) return Number(raw);
    if (raw === '十') return 10;
    if (raw.startsWith('十')) return 10 + (numberMap[raw.slice(1)] || 0);
    if (raw.includes('十')) {
        const [ten, one] = raw.split('十');
        return (numberMap[ten] || 1) * 10 + (numberMap[one] || 0);
    }
    return numberMap[raw] || Number.MAX_SAFE_INTEGER;
}

/**
 * 触发单个或多个容器元素的 MathJax 排版
 */
export function typesetMath(elements) {
    if (typeof window === 'undefined' || !window.MathJax || typeof window.MathJax.typesetPromise !== 'function') {
        return Promise.resolve();
    }
    const targets = Array.from(elements || []).filter(Boolean);
    if (targets.length === 0) return Promise.resolve();
    return window.MathJax.typesetPromise(targets).catch(err => {
        console.error('MathJax typeset failed:', err?.message || err);
    });
}

let activeTypesetToken = 0;

/**
 * 分批异步排版大量元素，防止长列表渲染阻塞主线程
 */
export function typesetMathBatched(elements, batchSize = 18) {
    const targets = Array.from(elements || []).filter(Boolean);
    if (targets.length === 0) return;

    if (targets.length <= batchSize) {
        typesetMath(targets);
        return;
    }

    const token = ++activeTypesetToken;
    let cursor = 0;

    const runNextBatch = async () => {
        if (token !== activeTypesetToken || cursor >= targets.length) return;
        const slice = targets.slice(cursor, cursor + batchSize);
        cursor += batchSize;
        await typesetMath(slice);
        if (token === activeTypesetToken && cursor < targets.length) {
            requestAnimationFrame(() => {
                runNextBatch();
            });
        }
    };

    runNextBatch();
}

/**
 * 通用文件下载助手
 */
export function downloadBlobFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 安全写入剪贴板（带降级复制）
 */
export async function copyTextToClipboard(text, fallbackTextarea = null) {
    const content = String(text ?? '');
    if (navigator?.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(content);
            return true;
        } catch (err) {
            // 降级到传统选中复制
        }
    }
    if (fallbackTextarea) {
        try {
            fallbackTextarea.focus();
            fallbackTextarea.select();
            return document.execCommand('copy');
        } catch (err) {
            return false;
        }
    }
    return false;
}

/**
 * 安全打开外部链接
 */
export function openExternalSafe(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
}

let quotaWarned = false;

/**
 * 安全写入 localStorage，捕获 QuotaExceededError 等存储异常避免业务崩溃
 */
export function safeStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (err) {
        console.error(`写入 localStorage["${key}"] 失败:`, err);
        if (!quotaWarned) {
            quotaWarned = true;
            showToast('本地存储空间不足，部分记录未能保存。请导出备份或清理冗余数据。', 'error', 5000);
        }
        return false;
    }
}

/**
 * 安全移除 localStorage 键
 */
export function safeStorageRemove(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (err) {
        console.error(`删除 localStorage["${key}"] 失败:`, err);
        return false;
    }
}

/**
 * 非阻塞 Toast 通知
 */
export function showToast(message, type = 'info', duration = 3000) {
    if (typeof document === 'undefined' || !document.body) return;

    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const iconMap = {
        success: 'check-circle-2',
        error: 'circle-alert',
        warning: 'triangle-alert',
        info: 'info'
    };
    const iconName = iconMap[type] || iconMap.info;
    toast.innerHTML = `<i data-lucide="${iconName}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: toast, attrs: { 'stroke-width': 1.8 } });
    }

    requestAnimationFrame(() => {
        toast.classList.add('is-visible');
    });

    const removeToast = () => {
        toast.classList.remove('is-visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        setTimeout(() => toast.remove(), 350);
    };

    if (duration > 0) {
        setTimeout(removeToast, duration);
    }
}
