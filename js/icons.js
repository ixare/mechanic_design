export function initIcons() {
    const render = () => {
        if (window.lucide && document.querySelector('i[data-lucide]')) {
            window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
        }
    };

    const observer = new MutationObserver(render);
    observer.observe(document.body, { childList: true, subtree: true });
    render();
    window.addEventListener('load', render, { once: true });
}
