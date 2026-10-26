/**
 * 周转轮系示意画布 (Planetary Gear Train Illustration)
 * 工程教材插图风格，支持拖拽交互与深浅色主题自适应
 */

let stopCurrent = null;

export function disposeMechanismCanvas() {
    if (stopCurrent) {
        stopCurrent();
        stopCurrent = null;
    }
}

function buildGearPath(ctx, cx, cy, radius, teeth, phase, isInternal = false) {
    const m = (2 * radius) / teeth;
    const addendum = isInternal ? radius - 0.78 * m : radius + 0.82 * m;
    const dedendum = isInternal ? radius + 0.95 * m : radius - 0.95 * m;
    const count = teeth * 4;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
        const angle = phase + (i / count) * Math.PI * 2;
        const mod = i % 4;
        const dist = (mod === 1 || mod === 2) ? addendum : dedendum;
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

function drawLighteningHoles(ctx, cx, cy, ringRadius, holeRadius, count, phase, palette) {
    for (let i = 0; i < count; i++) {
        const a = phase + (i / count) * Math.PI * 2;
        const hx = cx + Math.cos(a) * ringRadius;
        const hy = cy + Math.sin(a) * ringRadius;
        ctx.beginPath();
        ctx.arc(hx, hy, holeRadius, 0, Math.PI * 2);
        ctx.fillStyle = palette.bg;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = palette.mutedStroke;
        ctx.stroke();
    }
}

function renderSpurGear(ctx, cx, cy, radius, teeth, phase, palette, isSun = false) {
    ctx.save();

    buildGearPath(ctx, cx, cy, radius, teeth, phase);
    ctx.fillStyle = isSun ? palette.sunFill : palette.gearFill;
    ctx.fill();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = isSun ? palette.sunStroke : palette.gearStroke;
    ctx.stroke();

    // 分度圆 (点划线)
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = palette.pitchCircle;
    ctx.lineWidth = 0.9;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 轮缘内圈
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.74, 0, Math.PI * 2);
    ctx.fillStyle = palette.webFill;
    ctx.fill();
    ctx.strokeStyle = palette.mutedStroke;
    ctx.lineWidth = 1;
    ctx.stroke();

    if (radius > 34) {
        drawLighteningHoles(ctx, cx, cy, radius * 0.5, radius * 0.12, 4, phase, palette);
    }

    // 轮毂
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = palette.hubFill;
    ctx.fill();
    ctx.strokeStyle = isSun ? palette.accent : palette.gearStroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 轴孔与键槽
    const shaftR = radius * 0.11;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(phase);
    ctx.fillStyle = palette.shaftFill;
    ctx.fillRect(-shaftR * 0.36, -shaftR * 1.32, shaftR * 0.72, shaftR * 0.55);
    ctx.beginPath();
    ctx.arc(0, 0, shaftR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
}

function renderRingGear(ctx, cx, cy, innerRadius, outerRadius, teeth, phase, palette) {
    ctx.save();

    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerRadius * 0.9, 0, Math.PI * 2, true);
    ctx.fillStyle = palette.ringFill;
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = palette.gearStroke;
    ctx.stroke();

    buildGearPath(ctx, cx, cy, innerRadius, teeth, phase, true);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = palette.mutedStroke;
    ctx.stroke();

    // 外圈刻度
    const totalTicks = 36;
    for (let i = 0; i < totalTicks; i++) {
        const a = (i / totalTicks) * Math.PI * 2;
        const len = i % 3 === 0 ? 5 : 2.5;
        const x1 = cx + Math.cos(a) * (outerRadius - 1.5);
        const y1 = cy + Math.sin(a) * (outerRadius - 1.5);
        const x2 = cx + Math.cos(a) * (outerRadius - 1.5 - len);
        const y2 = cy + Math.sin(a) * (outerRadius - 1.5 - len);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = i % 3 === 0 ? palette.gearStroke : palette.mutedStroke;
        ctx.lineWidth = 0.9;
        ctx.stroke();
    }

    ctx.restore();
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
    let velocity = reducedMotion ? 0 : 0.01;
    let targetVelocity = velocity;
    let frame = 0;
    let lastX = null;
    let lastY = null;
    let active = false;
    let visible = true;

    function getPalette() {
        const isDark = document.body.classList.contains('dark-mode');
        if (isDark) {
            return {
                bg: '#161a1f',
                grid: 'rgba(148, 163, 184, 0.06)',
                centerline: 'rgba(148, 163, 184, 0.22)',
                gearFill: '#20262e',
                gearStroke: '#6b9ac4',
                sunFill: '#262d36',
                sunStroke: '#8ab4d8',
                webFill: '#1a1f26',
                hubFill: '#262e38',
                ringFill: 'rgba(30, 36, 44, 0.85)',
                mutedStroke: 'rgba(138, 180, 216, 0.34)',
                pitchCircle: 'rgba(217, 119, 87, 0.45)',
                carrierStroke: 'rgba(138, 180, 216, 0.48)',
                shaftFill: '#0f1216',
                accent: '#d97757',
                labelPrimary: '#94a3b8',
                labelSecondary: '#64748b'
            };
        }
        return {
            bg: '#f4f3ef',
            grid: 'rgba(37, 84, 122, 0.055)',
            centerline: 'rgba(37, 84, 122, 0.18)',
            gearFill: '#ffffff',
            gearStroke: '#25547a',
            sunFill: '#f9fbfd',
            sunStroke: '#1e4668',
            webFill: '#eef2f5',
            hubFill: '#ffffff',
            ringFill: 'rgba(232, 237, 242, 0.85)',
            mutedStroke: 'rgba(37, 84, 122, 0.32)',
            pitchCircle: 'rgba(194, 89, 52, 0.42)',
            carrierStroke: 'rgba(37, 84, 122, 0.42)',
            shaftFill: '#334155',
            accent: '#c25934',
            labelPrimary: '#475569',
            labelSecondary: '#64748b'
        };
    }

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
        if (width <= 0 || height <= 0) return;
        const palette = getPalette();

        ctx.fillStyle = palette.bg;
        ctx.fillRect(0, 0, width, height);

        // 细网格制图底纹
        const grid = 24;
        ctx.strokeStyle = palette.grid;
        ctx.lineWidth = 0.8;
        for (let x = 0.5; x < width; x += grid) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        for (let y = 0.5; y < height; y += grid) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }

        const scale = Math.min(width / 400, height / 310, 1.1);
        const center = { x: width * 0.5, y: height * 0.5 };

        // 工程基准中心线 (细点划线)
        ctx.save();
        ctx.strokeStyle = palette.centerline;
        ctx.lineWidth = 0.8;
        ctx.setLineDash([10, 4, 2, 4]);
        ctx.beginPath();
        ctx.moveTo(20, center.y); ctx.lineTo(width - 20, center.y);
        ctx.moveTo(center.x, 20); ctx.lineTo(center.x, height - 20);
        ctx.stroke();
        ctx.restore();

        const sunTeeth = 18;
        const planetTeeth = 15;
        const ringTeeth = 48;

        const sunRadius = 36 * scale;
        const planetRadius = (sunRadius / sunTeeth) * planetTeeth;
        const carrierRadius = sunRadius + planetRadius;
        const ringInnerRadius = sunRadius + 2 * planetRadius;
        const ringOuterRadius = ringInnerRadius + 18 * scale;

        const carrierPhase = phase * (sunTeeth / (sunTeeth + ringTeeth));

        // 行星轮公转分度圆
        ctx.beginPath();
        ctx.arc(center.x, center.y, carrierRadius, 0, Math.PI * 2);
        ctx.strokeStyle = palette.pitchCircle;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 行星架 H 连杆
        const planetCount = 3;
        for (let i = 0; i < planetCount; i++) {
            const angle = carrierPhase + (i / planetCount) * Math.PI * 2;
            const px = center.x + Math.cos(angle) * carrierRadius;
            const py = center.y + Math.sin(angle) * carrierRadius;

            ctx.beginPath();
            ctx.moveTo(center.x, center.y);
            ctx.lineTo(px, py);
            ctx.strokeStyle = palette.carrierStroke;
            ctx.lineWidth = 3 * scale;
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.lineCap = 'butt';
        }

        // 外内齿圈 z3
        renderRingGear(ctx, center.x, center.y, ringInnerRadius, ringOuterRadius, ringTeeth, 0, palette);

        // 行星轮 z2
        for (let i = 0; i < planetCount; i++) {
            const angle = carrierPhase + (i / planetCount) * Math.PI * 2;
            const px = center.x + Math.cos(angle) * carrierRadius;
            const py = center.y + Math.sin(angle) * carrierRadius;
            const planetSelfPhase = carrierPhase - (phase - carrierPhase) * (sunTeeth / planetTeeth);
            renderSpurGear(ctx, px, py, planetRadius, planetTeeth, planetSelfPhase, palette, false);
        }

        // 中心太阳轮 z1
        renderSpurGear(ctx, center.x, center.y, sunRadius, sunTeeth, phase, palette, true);

        // 图注说明 (简洁工程图注)
        ctx.save();
        ctx.font = '500 11px "JetBrains Mono", "Noto Sans SC", monospace';
        ctx.fillStyle = palette.labelPrimary;
        ctx.fillText(`2K-H 周转轮系   z₁=${sunTeeth}  z₂=${planetTeeth}  z₃=${ringTeeth}`, 16, 22);

        ctx.font = '400 11px "JetBrains Mono", "Noto Sans SC", monospace';
        ctx.fillStyle = palette.labelSecondary;
        ctx.fillText(`i₁H = ${(1 + ringTeeth / sunTeeth).toFixed(2)}`, 16, height - 14);

        ctx.textAlign = 'right';
        ctx.fillText('可拖拽拨动齿轮', width - 16, height - 14);
        ctx.restore();
    }

    function tick() {
        if (!visible || document.hidden) {
            frame = 0;
            return;
        }

        if (!active) {
            velocity += (targetVelocity - velocity) * 0.04;
            phase += velocity;
            if (Math.abs(targetVelocity) > 0.004) {
                targetVelocity *= 0.992;
                if (Math.abs(targetVelocity) < 0.009 && !reducedMotion) {
                    targetVelocity = 0.009;
                }
            }
        }

        draw();
        frame = requestAnimationFrame(tick);
    }

    function start() {
        if (!frame && visible && !document.hidden) {
            frame = requestAnimationFrame(tick);
        }
    }

    function pointerDown(event) {
        active = true;
        lastX = event.clientX;
        lastY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
        start();
    }

    function pointerMove(event) {
        if (!active || lastX === null) return;
        const movementX = event.clientX - lastX;
        const movementY = event.clientY - lastY;
        const delta = Math.abs(movementX) > Math.abs(movementY) ? movementX : movementY;

        phase += delta * 0.011;
        targetVelocity = reducedMotion ? 0 : Math.max(-0.2, Math.min(0.2, delta * 0.012));
        velocity = targetVelocity;

        lastX = event.clientX;
        lastY = event.clientY;
        draw();
    }

    function pointerUp() {
        active = false;
        lastX = null;
        lastY = null;
        start();
    }

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (visible) start();
        else if (frame) {
            cancelAnimationFrame(frame);
            frame = 0;
        }
    });
    const themeObserver = new MutationObserver(() => draw());

    resizeObserver.observe(canvas);
    intersectionObserver.observe(canvas);
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);

    start();

    stopCurrent = () => {
        if (frame) cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        themeObserver.disconnect();
        canvas.removeEventListener('pointerdown', pointerDown);
        canvas.removeEventListener('pointermove', pointerMove);
        canvas.removeEventListener('pointerup', pointerUp);
        canvas.removeEventListener('pointercancel', pointerUp);
    };
}
