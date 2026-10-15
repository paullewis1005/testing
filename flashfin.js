(function () {
    'use strict';

    const RUFFLE_URL = 'https://unpkg.com/@ruffle-rs/ruffle';
    const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    function createOverlay(title) {
        const existing = document.getElementById('flashfin-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'flashfin-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;z-index:999999;display:flex;flex-direction:column;';

        const bar = document.createElement('div');
        bar.style.cssText = 'height:40px;background:#101010;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-family:sans-serif;border-bottom:1px solid #222;';
        bar.innerHTML = `<span style="font-weight:bold;">${title}</span>`;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕ Close Game';
        closeBtn.style.cssText = 'background:#e53935;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-weight:bold;';
        closeBtn.onclick = () => overlay.remove();

        bar.appendChild(closeBtn);

        const content = document.createElement('div');
        content.style.cssText = 'flex:1;width:100%;height:calc(100vh - 40px);position:relative;overflow:hidden;';

        overlay.appendChild(bar);
        overlay.appendChild(content);
        document.body.appendChild(overlay);
        return content;
    }

    async function launchFlash(url, title) {
        const container = createOverlay(title);
        await loadScript(RUFFLE_URL);
        const ruffle = window.RufflePlayer.newest();
        const player = ruffle.createPlayer();
        player.style.cssText = 'width:100%;height:100%;';
        container.appendChild(player);
        player.load(url);
    }

    async function launchHtml(url, title) {
        const container = createOverlay(title);
        const res = await fetch(url);
        const html = await res.text();
        const blob = new Blob([html], { type: 'text/html' });
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%;height:100%;border:none;background:#fff;';
        iframe.src = URL.createObjectURL(blob);
        container.appendChild(iframe);
    }

    async function launchZipHtml(url, title) {
        const container = createOverlay(title + ' (Loading...)');
        await loadScript(JSZIP_URL);
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const zip = await window.JSZip.loadAsync(buf);

        const blobMap = {};
        let indexFile = null;

        for (const [path, file] of Object.entries(zip.files)) {
            if (file.dir) continue;
            const ext = path.split('.').pop().toLowerCase();
            const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', jpg: 'image/jpeg', wasm: 'application/wasm', mp3: 'audio/mpeg', ogg: 'audio/ogg', json: 'application/json' }[ext] || 'application/octet-stream';
            const blob = await file.async('blob');
            blobMap[path] = URL.createObjectURL(new Blob([blob], { type: mime }));
            if (path.endsWith('index.html') && (!indexFile || path.length < indexFile.length)) {
                indexFile = path;
            }
        }

        if (!indexFile) {
            container.innerHTML = '<p style="color:#fff;padding:20px;">Error: No index.html found in archive.</p>';
            return;
        }

        let html = await zip.file(indexFile).async('string');
        for (const [path, blobUrl] of Object.entries(blobMap)) {
            const cleanPath = path.replace(/^.*?\//, '');
            html = html.split(path).join(blobUrl).split(cleanPath).join(blobUrl);
        }

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%;height:100%;border:none;background:#fff;';
        iframe.src = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        container.innerHTML = '';
        container.appendChild(iframe);
    }

    async function checkCurrentItem() {
        const match = window.location.hash.match(/id=([a-f0-9]{32})/i);
        if (!match || !window.ApiClient) return;

        const itemId = match[1];
        const userId = window.ApiClient.getCurrentUserId();
        if (!userId) return;

        try {
            const item = await window.ApiClient.getItem(userId, itemId);
            if (!item || !item.Path) return;

            const ext = item.Path.split('.').pop().toLowerCase();
            if (!['swf', 'html', 'zip', 'cbz'].includes(ext)) return;

            const detailContainer = document.querySelector('.mainDetailButtons:not(.hide)');
            if (!detailContainer || detailContainer.querySelector('.flashfin-btn')) return;

            const btn = document.createElement('button');
            btn.className = 'button-flat btnPlay detailButton emby-button flashfin-btn';
            btn.style.cssText = 'background:#00a4dc;color:#fff;border-radius:4px;padding:8px 16px;margin-right:10px;font-weight:bold;';
            btn.innerHTML = `<span>▶ Play ${ext === 'swf' ? 'Flash' : 'HTML5'}</span>`;

            const downloadUrl = window.ApiClient.getUrl(`Items/${itemId}/Download`, { api_key: window.ApiClient.accessToken() });

            btn.onclick = (e) => {
                e.preventDefault();
                if (ext === 'swf') launchFlash(downloadUrl, item.Name);
                else if (ext === 'html') launchHtml(downloadUrl, item.Name);
                else launchZipHtml(downloadUrl, item.Name);
            };

            detailContainer.prepend(btn);
        } catch (e) {}
    }

    setInterval(checkCurrentItem, 800);
})();
