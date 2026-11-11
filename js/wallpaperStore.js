export const LEGACY_WALLPAPER_KEY = 'mech_design_wallpaper';
const DB_NAME = 'mech_design_assets';
const STORE_NAME = 'wallpapers';
const CURRENT_KEY = 'current';

function openWallpaperDb() {
    if (typeof indexedDB === 'undefined') {
        return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function idbGet(key) {
    const db = await openWallpaperDb();
    if (!db) return null;
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => reject(req.error);
        });
    } finally {
        db.close();
    }
}

async function idbSet(key, value) {
    const db = await openWallpaperDb();
    if (!db) return false;
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        return true;
    } finally {
        db.close();
    }
}

async function idbDelete(key) {
    const db = await openWallpaperDb();
    if (!db) return;
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

/**
 * 读取自定义壁纸，并自动将旧版 localStorage 中的大体积壁纸迁移至 IndexedDB
 */
export async function loadWallpaperData() {
    try {
        const stored = await idbGet(CURRENT_KEY);
        if (stored) return stored;
    } catch (err) {
        console.warn('读取 IndexedDB 壁纸失败，尝试回退 localStorage:', err);
    }

    try {
        const legacy = localStorage.getItem(LEGACY_WALLPAPER_KEY);
        if (!legacy) return null;
        const migrated = await idbSet(CURRENT_KEY, legacy).catch(() => false);
        if (migrated) {
            localStorage.removeItem(LEGACY_WALLPAPER_KEY);
        }
        return legacy;
    } catch (err) {
        return null;
    }
}

/**
 * 保存壁纸数据到 IndexedDB（释放 localStorage 配额）
 */
export async function saveWallpaperData(dataUrlOrBlob) {
    try {
        const saved = await idbSet(CURRENT_KEY, dataUrlOrBlob);
        if (saved) {
            try {
                localStorage.removeItem(LEGACY_WALLPAPER_KEY);
            } catch (err) {
                // 忽略清理异常
            }
            return true;
        }
    } catch (err) {
        console.error('写入 IndexedDB 壁纸失败:', err);
    }

    if (typeof dataUrlOrBlob === 'string') {
        localStorage.setItem(LEGACY_WALLPAPER_KEY, dataUrlOrBlob);
        return true;
    }
    throw new Error('当前浏览器不支持保存自定义壁纸。');
}

/**
 * 清除自定义壁纸
 */
export async function clearWallpaperData() {
    try {
        await idbDelete(CURRENT_KEY);
    } catch (err) {
        console.warn('清理 IndexedDB 壁纸失败:', err);
    }
    try {
        localStorage.removeItem(LEGACY_WALLPAPER_KEY);
    } catch (err) {
        // 忽略清理异常
    }
}
