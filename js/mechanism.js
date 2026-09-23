let stopCurrent = null;

export function disposeMechanismCanvas() {
    if (stopCurrent) {
        stopCurrent();
        stopCurrent = null;
    }
}

function gearPath(ctx, cx, cy, radius, teeth, phase) {
    const root = radius * 0.87;
    const tip = radius * 1.08;
    const count = teeth * 4;
    ctx.beginPath();
    for (let index = 0; index < count; index++) {
        const angle = phase + (index / count) * Math.PI * 2;
        const distance = index % 4 === 1 || index % 4 === 2 ? tip : root;
        const x = cx + Math.cos(angle) * distance;
        const y = cy + Math.sin(angle) * distance;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

function drawGear(ctx, gear, phase, foreground) {
    gearPath(ctx, gear.x, gear.y, gear.radius, gear.teeth, phase);
    ctx.fillStyle = foreground ? '#d8e3dc' : '#304648';
    ctx.fill();
    ctx.lineWidth = foreground ? 1.6 : 1.2;
    ctx.strokeStyle = foreground ? '#f5f8f3' : '#779392';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(gear.x, gear.y, gear.radius * 0.59, 0, Math.PI * 2);
    ctx.fillStyle = '#18282a';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#759392';
    ctx.stroke();

    ctx.save();
    ctx.translate(gear.x, gear.y);
    ctx.rotate(phase);
    for (let spoke = 0; spoke < 4; spoke++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = foreground ? '#c7d7cd' : '#526e70';
        ctx.fillRect(-gear.radius * 0.065, gear.radius * 0.18, gear.radius * 0.13, gear.radius * 0.37);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(gear.x, gear.y, gear.radius * 0.145, 0, Math.PI * 2);
    ctx.fillStyle = foreground ? '#d6563c' : '#bacfca';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(gear.x, gear.y, gear.radius * 0.065, 0, Math.PI * 2);
    ctx.fillStyle = '#18282a';
    ctx.fill();
}

export function initMechanismCanvas() {
    disposeMechanismCanvas();
    const canvas = document.getElementById('mechanism-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let phase = 0;
    let velocity = reducedMotion ? 0 : 0.012;
    let frame = 0;
    let lastX = null;
    let active = false;
    let visible = true;

    function resize() {
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        width = rect.width;
        height = rect.height;
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        draw();
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);
        const grid = 32;
        ctx.strokeStyle = 'rgba(174, 204, 199, .11)';
        ctx.lineWidth = 1;
        for (let x = 0.5; x < width; x += grid) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        for (let y = 0.5; y < height; y += grid) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }

        const scale = Math.min(width / 410, height / 330, 1.2);
        const large = { x: width * 0.62, y: height * 0.54, radius: 107 * scale, teeth: 24 };
        const small = { x: large.x - 169 * scale, y: large.y + 62 * scale, radius: 69 * scale, teeth: 16 };

        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = 'rgba(212, 234, 229, .43)';
        ctx.beginPath();
        ctx.moveTo(small.x, small.y);
        ctx.lineTo(large.x, large.y);
        ctx.stroke();
        ctx.setLineDash([]);

        drawGear(ctx, large, phase, true);
        drawGear(ctx, small, -phase * 1.5 + Math.PI / 16, false);

        ctx.strokeStyle = 'rgba(230, 242, 236, .45)';
        ctx.lineWidth = 1;
        [large, small].forEach(gear => {
            ctx.beginPath();
            ctx.arc(gear.x, gear.y, gear.radius * 1.16, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(gear.x - 8, gear.y);
            ctx.lineTo(gear.x + 8, gear.y);
            ctx.moveTo(gear.x, gear.y - 8);
            ctx.lineTo(gear.x, gear.y + 8);
            ctx.stroke();
        });
    }

    function tick() {
        if (!visible || document.hidden) { frame = 0; return; }
        if (!active) {
            phase += velocity;
            velocity *= 0.988;
        }
        draw();
        if (active || Math.abs(velocity) > 0.0003) frame = requestAnimationFrame(tick);
        else frame = 0;
    }

    function start() {
        if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick);
    }

    function pointerDown(event) {
        active = true;
        lastX = event.clientX;
        canvas.setPointerCapture(event.pointerId);
        start();
    }

    function pointerMove(event) {
        if (!active || lastX === null) return;
        const movement = event.clientX - lastX;
        phase += movement * 0.012;
        velocity = reducedMotion ? 0 : Math.max(-0.12, Math.min(0.12, movement * 0.008));
        lastX = event.clientX;
        draw();
    }

    function pointerUp() {
        active = false;
        lastX = null;
        start();
    }

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (visible) start();
        else if (frame) { cancelAnimationFrame(frame); frame = 0; }
    });
    resizeObserver.observe(canvas);
    intersectionObserver.observe(canvas);
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);
    start();

    stopCurrent = () => {
        if (frame) cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        canvas.removeEventListener('pointerdown', pointerDown);
        canvas.removeEventListener('pointermove', pointerMove);
        canvas.removeEventListener('pointerup', pointerUp);
        canvas.removeEventListener('pointercancel', pointerUp);
    };
}
