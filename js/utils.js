export function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function typesetMath(elements) {
    if (window.MathJax && elements && elements.length > 0) {
        try {
            MathJax.typesetPromise(elements).catch(function (err) {
                console.error('MathJax typeset failed: ' + err.message);
            });
        } catch(err) {
             console.error('MathJax error: ' + err.message);
        }
    }
}
