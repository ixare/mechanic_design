/**
 * Kinetic Mechanism Canvas - Precision Planetary & Epicyclic Kinematics
 * Awwwards / FWA tier Interactive Mechanical Art Canvas
 */

let stopCurrent = null;

export function disposeMechanismCanvas() {
    if (stopCurrent) {
        stopCurrent();
        stopCurrent = null;
    }
}

// 渐开线齿廓路径发生器
function buildGearPath(ctx, cx, cy, radius, teeth, phase, isInternal = false) {
    const m = (2 * radius) / teeth; // 模数
    const addendum = isInternal ? radius - 0.8 * m : radius + 0.85 * m;
    const dedendum = isInternal ? radius + 1.0 * m : radius - 1.0 * m;
    const count = teeth * 4;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
        const angle = phase + (i / count) * Math.PI * 2;
        const mod = i % 4;
        let dist = dedendum;
        if (mod === 1 || mod === 2) {
            dist = addendum;
        }
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

// 绘制螺栓孔与减重孔
function drawLighteningHoles(ctx, cx, cy, ringRadius, holeRadius, count, phase) {
    for (let i = 0; i < count; i++) {
        const a = phase + (i / count) * Math.PI * 2;
        const hx = cx + Math.cos(a) * ringRadius;
        const hy = cy + Math.sin(a) * ringRadius;
        ctx.beginPath();
        ctx.arc(hx, hy, holeRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#0a1617';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(79, 142, 137, 0.45)';
        ctx.stroke();

        // 螺栓小亮点
        ctx.beginPath();
        ctx.arc(hx, hy, holeRadius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 107, 74, 0.7)';
        ctx.fill();
    }
}

// 绘制外啮合精密齿轮
function renderSpurGear(ctx, cx, cy, radius, teeth, phase, isDark, primaryColor, accentColor) {
    ctx.save();
    
    // 齿形本体
    buildGearPath(ctx, cx, cy, radius, teeth, phase);
    ctx.fillStyle = isDark ? '#162829' : '#e6efe9';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = primaryColor;
    ctx.stroke();

    // 齿根分度过渡圆
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.96, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100, 180, 170, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 凹陷轮缘圈
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.76, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? '#0f1c1e' : '#d5e2dc';
    ctx.fill();
    ctx.strokeStyle = isDark ? '#233d3e' : '#b2c8bf';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 减重沉孔
    if (radius > 45) {
        const holeCount = teeth >= 24 ? 5 : 4;
        drawLighteningHoles(ctx, cx, cy, radius * 0.52, radius * 0.13, holeCount, phase);
    }

    // 中心轮毂
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? '#1e3436' : '#c8dbd3';
    ctx.fill();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 轴孔与平键槽
    const shaftR = radius * 0.12;
    ctx.beginPath();
    ctx.arc(cx, cy, shaftR, 0, Math.PI * 2);
    ctx.fillStyle = '#081011';
    ctx.fill();

    // 键槽
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(phase);
    ctx.fillStyle = accentColor;
    ctx.fillRect(-shaftR * 0.35, -shaftR * 1.35, shaftR * 0.7, shaftR * 0.6);
    ctx.restore();

    ctx.restore();
}

// 绘制内齿圈
function renderRingGear(ctx, cx, cy, innerRadius, outerRadius, teeth, phase, isDark, strokeColor) {
    ctx.save();
    
    // 内齿圈基座外环
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerRadius * 0.88, 0, Math.PI * 2, true);
    ctx.fillStyle = isDark ? 'rgba(18, 33, 34, 0.75)' : 'rgba(215, 230, 224, 0.75)';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();

    // 内齿齿廓
    buildGearPath(ctx, cx, cy, innerRadius, teeth, phase, true);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(120, 195, 185, 0.4)';
    ctx.stroke();

    // 外圈装配标尺刻度
    const totalTicks = 36;
    for (let i = 0; i < totalTicks; i++) {
        const a = (i / totalTicks) * Math.PI * 2;
        const len = i % 3 === 0 ? 6 : 3;
        const x1 = cx + Math.cos(a) * (outerRadius - 2);
        const y1 = cy + Math.sin(a) * (outerRadius - 2);
        const x2 = cx + Math.cos(a) * (outerRadius - 2 - len);
        const y2 = cy + Math.sin(a) * (outerRadius - 2 - len);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = i % 3 === 0 ? 'rgba(255, 85, 51, 0.8)' : 'rgba(120, 195, 185, 0.35)';
        ctx.lineWidth = 1;
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
    let velocity = reducedMotion ? 0 : 0.015;
    let targetVelocity = velocity;
    let frame = 0;
    let lastX = null;
    let lastY = null;
    let active = false;
    let visible = true;
    let mousePos = { x: -100, y: -100 };
    let hoverActive = false;

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
        ctx.clearRect(0, 0, width, height);

        const isDark = document.body.classList.contains('dark-mode') || !document.body.classList.contains('has-wallpaper');
        const primaryColor = isDark ? '#5aa99e' : '#1e6862';
        const accentOrange = '#ff5533';
        const gridColor = isDark ? 'rgba(74, 133, 126, 0.12)' : 'rgba(30, 104, 98, 0.08)';

        // 1. 工业 CAD 精密网格底纹
        const grid = 28;
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 0.8;
        for (let x = 0.5; x < width; x += grid) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        for (let y = 0.5; y < height; y += grid) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }

        // 2. 坐标原点十字准星标
        ctx.strokeStyle = 'rgba(255, 85, 51, 0.35)';
        ctx.lineWidth = 1;
        const markerSize = 8;
        [[20, 20], [width - 20, 20], [20, height - 20], [width - 20, height - 20]].forEach(([cx, cy]) => {
            ctx.beginPath();
            ctx.moveTo(cx - markerSize, cy); ctx.lineTo(cx + markerSize, cy);
            ctx.moveTo(cx, cy - markerSize); ctx.lineTo(cx, cy + markerSize);
            ctx.stroke();
        });

        // 3. 传动系统动力学布局
        const scale = Math.min(width / 440, height / 350, 1.15);
        const center = { x: width * 0.48, y: height * 0.5 };
        
        // 轮系尺寸定义：行星齿轮系
        // 太阳轮：z1 = 18, 模数 m, 行星轮：z2 = 15, 内齿圈：z3 = z1 + 2*z2 = 48
        const sunTeeth = 18;
        const planetTeeth = 15;
        const ringTeeth = 48;

        const sunRadius = 40 * scale;
        const planetRadius = (sunRadius / sunTeeth) * planetTeeth;
        const carrierRadius = sunRadius + planetRadius;
        const ringInnerRadius = sunRadius + 2 * planetRadius;
        const ringOuterRadius = ringInnerRadius + 22 * scale;

        // 行星架旋转角度与太阳轮相位关联 (固定齿圈条件)
        // i_H = 1 / (1 + z3/z1) = 18 / 66 = 0.2727
        const carrierPhase = phase * (sunTeeth / (sunTeeth + ringTeeth));

        // 4. 绘制行星架轨迹 (点划线)
        ctx.beginPath();
        ctx.arc(center.x, center.y, carrierRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 85, 51, 0.4)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 行星架三叉臂
        const planetCount = 3;
        for (let i = 0; i < planetCount; i++) {
            const angle = carrierPhase + (i / planetCount) * Math.PI * 2;
            const px = center.x + Math.cos(angle) * carrierRadius;
            const py = center.y + Math.sin(angle) * carrierRadius;

            // 联接连杆
            ctx.beginPath();
            ctx.moveTo(center.x, center.y);
            ctx.lineTo(px, py);
            ctx.strokeStyle = 'rgba(90, 169, 158, 0.6)';
            ctx.lineWidth = 3.5 * scale;
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.lineCap = 'butt';
        }

        // 5. 绘制外齿圈
        renderRingGear(ctx, center.x, center.y, ringInnerRadius, ringOuterRadius, ringTeeth, 0, isDark, primaryColor);

        // 6. 绘制3个行星齿轮
        for (let i = 0; i < planetCount; i++) {
            const angle = carrierPhase + (i / planetCount) * Math.PI * 2;
            const px = center.x + Math.cos(angle) * carrierRadius;
            const py = center.y + Math.sin(angle) * carrierRadius;
            
            // 行星齿轮自转角速度
            // 行星轮相对行星架转角: (phase - carrierPhase) * (-sunTeeth / planetTeeth)
            const planetSelfPhase = carrierPhase - (phase - carrierPhase) * (sunTeeth / planetTeeth);
            renderSpurGear(ctx, px, py, planetRadius, planetTeeth, planetSelfPhase, isDark, '#89c5bc', accentOrange);
        }

        // 7. 绘制中心太阳轮
        renderSpurGear(ctx, center.x, center.y, sunRadius, sunTeeth, phase, isDark, '#d56046', '#ffffff');

        // 8. 实时动力学遥测 HUD 数据覆盖 (Telemetry Overlay)
        ctx.save();
        ctx.font = '600 11px "JetBrains Mono", "Barlow Condensed", monospace';
        ctx.fillStyle = isDark ? 'rgba(122, 184, 175, 0.85)' : 'rgba(43, 95, 88, 0.85)';
        
        // 顶部机构技术参数
        ctx.fillText(`EPICYCLIC TRAIN // 周转行星轮系机构`, 20, 26);
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.fillStyle = isDark ? 'rgba(122, 184, 175, 0.6)' : 'rgba(43, 95, 88, 0.6)';
        ctx.fillText(`z1: ${sunTeeth} (太阳轮) · z2: ${planetTeeth} (行星轮) · z3: ${ringTeeth} (内齿圈)`, 20, 42);

        // 底部传动参数
        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.fillStyle = isDark ? 'rgba(122, 184, 175, 0.85)' : 'rgba(43, 95, 88, 0.85)';
        ctx.fillText(`TRANSMISSION RATIO i = ${(1 + ringTeeth / sunTeeth).toFixed(2)} · ENGAGED`, 20, height - 20);

        // 底部右侧转速指示
        const rpm = Math.abs(velocity * 60 * 10).toFixed(1);
        ctx.fillStyle = accentOrange;
        ctx.textAlign = 'right';
        ctx.fillText(`SPEED: ${(velocity * 50).toFixed(2)} rad/s  [${rpm} RPM]`, width - 20, height - 20);
        ctx.textAlign = 'left';

        // 鼠标定位探针光效
        if (hoverActive && mousePos.x > 0 && mousePos.y > 0) {
            ctx.beginPath();
            ctx.arc(mousePos.x, mousePos.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = accentOrange;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(mousePos.x, mousePos.y, 16, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 85, 51, 0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.restore();
    }

    function tick() {
        if (!visible || document.hidden) {
            frame = 0;
            return;
        }

        if (!active) {
            // 平滑阻尼回稳到基础转速
            velocity += (targetVelocity - velocity) * 0.04;
            phase += velocity;
            // 保持微弱动力回转，若被加速则缓慢回到 baseline
            if (Math.abs(targetVelocity) > 0.005) {
                targetVelocity *= 0.992;
                if (Math.abs(targetVelocity) < 0.012 && !reducedMotion) {
                    targetVelocity = 0.012;
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
        const rect = canvas.getBoundingClientRect();
        mousePos.x = event.clientX - rect.left;
        mousePos.y = event.clientY - rect.top;
        hoverActive = true;

        if (!active || lastX === null) return;
        const movementX = event.clientX - lastX;
        const movementY = event.clientY - lastY;
        const delta = Math.abs(movementX) > Math.abs(movementY) ? movementX : movementY;

        phase += delta * 0.012;
        targetVelocity = reducedMotion ? 0 : Math.max(-0.25, Math.min(0.25, delta * 0.015));
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

    function pointerLeave() {
        hoverActive = false;
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

    resizeObserver.observe(canvas);
    intersectionObserver.observe(canvas);
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);
    canvas.addEventListener('pointerleave', pointerLeave);
    
    start();

    stopCurrent = () => {
        if (frame) cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        canvas.removeEventListener('pointerdown', pointerDown);
        canvas.removeEventListener('pointermove', pointerMove);
        canvas.removeEventListener('pointerup', pointerUp);
        canvas.removeEventListener('pointercancel', pointerUp);
        canvas.removeEventListener('pointerleave', pointerLeave);
    };
}
