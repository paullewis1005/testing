(function () {
    'use strict';
    console.log('[FlashFin] Script loaded!');

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

    async function launchGame(url, title) {
        const container = createOverlay(title);
        try {
            const res = await fetch(url);
            const buf = await res.arrayBuffer();
            const bytes = new Uint8Array(buf.slice(0, 4));
            const sig = String.fromCharCode(...bytes);

            if (sig.startsWith('FWS') || sig.startsWith('CWS') || sig.startsWith('ZWS')) {
                await loadScript(RUFFLE_URL);
                const ruffle = window.RufflePlayer.newest();
                const player = ruffle.createPlayer();
                player.style.cssText = 'width:100%;height:100%;';
                container.appendChild(player);
                player.load({ data: buf });
            } else if (sig.startsWith('PK')) {
                await loadScript(JSZIP_URL);
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

                let html = await zip.file(indexFile).async('string');
                for (const [path, blobUrl] of Object.entries(blobMap)) {
                    const cleanPath = path.replace(/^.*?\//, '');
                    html = html.split(path).join(blobUrl).split(cleanPath).join(blobUrl);
                }

                const iframe = document.createElement('iframe');
                iframe.style.cssText = 'width:100%;height:100%;border:none;background:#fff;';
                iframe.src = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
                container.appendChild(iframe);
            } else {
                const iframe = document.createElement('iframe');
                iframe.style.cssText = 'width:100%;height:100%;border:none;background:#fff;';
                iframe.src = URL.createObjectURL(new Blob([buf], { type: 'text/html' }));
                container.appendChild(iframe);
            }
        } catch (err) {
            container.innerHTML = `<p style="color:#fff;padding:20px;">Error loading game: ${err.message}</p>`;
        }
    }

    async function injectButton() {
        const match = window.location.hash.match(/id=([a-f0-9]{32})/i);
        if (!match || !window.ApiClient) return;

        const detailPage = document.querySelector('#itemDetailPage:not(.hide), .itemDetailPage:not(.hide)') || document.body;
        if (detailPage.querySelector('.flashfin-btn')) return;

        const itemId = match[1];
        const userId = window.ApiClient.getCurrentUserId();
        if (!userId) return;

        try {
            const item = await window.ApiClient.getItem(userId, itemId);
            if (!item || !item.Path) return;

            const nameLower = (item.Name + ' ' + item.Path).toLowerCase();
            if (!nameLower.includes('flash') && !nameLower.includes('html') && !['swf', 'html', 'zip', 'cbz'].includes(item.Path.split('.').pop().toLowerCase())) return;

            const targetBar = detailPage.querySelector('.mainDetailButtons, .detailPagePrimaryContainer, .itemName');
            if (!targetBar) return;

            const downloadUrl = window.ApiClient.getUrl(`Items/${itemId}/Download`, { api_key: window.ApiClient.accessToken() });

            const btn = document.createElement('button');
            btn.className = 'flashfin-btn';
            btn.style.cssText = 'background:#00a4dc;color:#fff;border:none;border-radius:4px;padding:10px 20px;margin:10px 10px 10px 0;font-weight:bold;cursor:pointer;z-index:9999;font-size:15px;';
            btn.textContent = '▶ Play Game';
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                launchGame(downloadUrl, item.Name);
            };

            targetBar.prepend(btn);

            detailPage.querySelectorAll('.btnPlay').forEach((nativeBtn) => {
                nativeBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    launchGame(downloadUrl, item.Name);
                };
            });
        } catch (e) {
            console.error('[FlashFin]', e);
        }
    }

    setInterval(injectButton, 700);
})();
