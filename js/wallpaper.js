import { state } from './state.js';
import { showToast } from './utils.js';
import { closeModal, confirmDialog, openModal } from './modal.js';
import { clearWallpaperData, loadWallpaperData, saveWallpaperData } from './wallpaperStore.js';

const CROPPER_CSS_URL = 'https://cdn.bootcdn.net/ajax/libs/cropperjs/1.5.13/cropper.min.css';
const CROPPER_JS_URL = 'https://cdn.bootcdn.net/ajax/libs/cropperjs/1.5.13/cropper.min.js';

let currentWallpaperObjectUrl = null;
let cropperLoadPromise = null;

/**
 * 按需加载 Cropper.js 样式与脚本，避免阻塞首屏渲染
 */
function ensureCropperLoaded() {
    if (typeof window.Cropper === 'function') {
        return Promise.resolve();
    }
    if (cropperLoadPromise) {
        return cropperLoadPromise;
    }

    cropperLoadPromise = new Promise((resolve, reject) => {
        if (!document.querySelector(`link[href="${CROPPER_CSS_URL}"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = CROPPER_CSS_URL;
            link.crossOrigin = 'anonymous';
            document.head.appendChild(link);
        }

        const script = document.createElement('script');
        script.src = CROPPER_JS_URL;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve();
        script.onerror = () => {
            cropperLoadPromise = null;
            reject(new Error('图片裁剪组件加载失败，请检查网络连接。'));
        };
        document.head.appendChild(script);
    });

    return cropperLoadPromise;
}

function revokeWallpaperUrl() {
    if (currentWallpaperObjectUrl) {
        URL.revokeObjectURL(currentWallpaperObjectUrl);
        currentWallpaperObjectUrl = null;
    }
}

export async function initWallpaper() {
    const saved = await loadWallpaperData();
    if (saved) {
        applyWallpaper(saved);
    }
}

export function applyWallpaper(source) {
    revokeWallpaperUrl();
    let url = '';
    if (source instanceof Blob) {
        currentWallpaperObjectUrl = URL.createObjectURL(source);
        url = currentWallpaperObjectUrl;
    } else if (typeof source === 'string' && source) {
        url = source;
    }
    if (!url) return;

    const safeUrl = url.replace(/"/g, '\\"');
    document.body.style.setProperty('--wallpaper-image', `url("${safeUrl}")`);
    document.body.style.backgroundImage = '';
    document.body.classList.add('has-wallpaper');
}

export async function removeWallpaper() {
    await clearWallpaperData();
    revokeWallpaperUrl();
    document.body.style.removeProperty('--wallpaper-image');
    document.body.style.backgroundImage = '';
    document.body.classList.remove('has-wallpaper');
    showToast('自定义背景已清除。', 'success');
}

export async function handleWallpaperUpload(input) {
    const file = input?.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        showToast('图片太大，请上传 5MB 以内的图片。', 'warning');
        input.value = '';
        return;
    }

    try {
        await ensureCropperLoaded();
    } catch (err) {
        showToast(err.message || '图片裁剪组件加载失败。', 'error');
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = event => {
        const image = document.getElementById('cropper-image');
        if (!image) return;

        if (state.cropper) {
            state.cropper.destroy();
            state.cropper = null;
        }

        image.onload = () => {
            if (typeof window.Cropper !== 'function') return;
            state.cropper = new window.Cropper(image, {
                aspectRatio: NaN,
                viewMode: 1,
                autoCropArea: 0.9,
                responsive: true,
                restore: false,
                checkCrossOrigin: false
            });
        };
        image.src = String(event.target?.result || '');
        openModal('cropper-modal');
    };
    reader.onerror = () => showToast('读取图片文件失败，请重试。', 'error');
    reader.readAsDataURL(file);
    input.value = '';
}

export async function confirmCrop() {
    if (!state.cropper) return;
    const canvas = state.cropper.getCroppedCanvas({
        maxWidth: 1920,
        maxHeight: 1080
    });
    if (!canvas) return;

    try {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86));
        const payload = blob || canvas.toDataURL('image/jpeg', 0.85);
        await saveWallpaperData(payload);
        applyWallpaper(payload);
        closeCropper();
        showToast('自定义背景已应用。', 'success');
    } catch (error) {
        showToast('背景保存失败：裁剪后的图片可能过大，请尝试缩小区域。', 'error');
        console.error(error);
    }
}

export function closeCropper() {
    closeModal('cropper-modal');
    if (state.cropper) {
        state.cropper.destroy();
        state.cropper = null;
    }
}

export async function triggerWallpaperUpload() {
    if (document.body.classList.contains('has-wallpaper')) {
        const choice = await confirmDialog({
            title: '自定义背景',
            message: '当前已启用自定义背景图片，你可以更换新图片或清除当前背景。',
            confirmText: '更换背景',
            extraText: '清除背景',
            cancelText: '取消'
        });
        if (choice === 'extra') {
            await removeWallpaper();
            return;
        }
        if (choice !== true) {
            return;
        }
    }
    document.getElementById('wallpaper-upload')?.click();
}
