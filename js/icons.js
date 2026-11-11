/**
 * 局部按需渲染 Lucide 图标，避免全局 MutationObserver 在 MathJax 排版时触发全树扫描
 */
export function renderIcons(root = document.body) {
    if (typeof window === 'undefined' || !window.lucide || !root) return;
    if (!root.querySelector || !root.querySelector('i[data-lucide]')) return;

    window.lucide.createIcons({
        root,
        attrs: { 'stroke-width': 1.8 }
    });
}

/**
 * 初始化静态区域图标，并在资源加载完成后补扫一次
 */
export function initIcons() {
    renderIcons(document.body);
    if (document.readyState !== 'complete') {
        window.addEventListener('load', () => renderIcons(document.body), { once: true });
    }
}
