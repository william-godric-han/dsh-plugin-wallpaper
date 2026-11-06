window.__ModuleLoader__.load({
  id: '@local/dsh-beautify',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const useState = React.useState;
    const useEffect = React.useEffect;

    const NS = 'dsh-beautify';
    const SETTINGS_KEY = 'dsh-beautify/settings/v1';
    const DB_NAME = 'dsh-beautify';
    const DB_STORE = 'media';
    const WALL_ID = 'dsh-beautify-wall';
    const FALLBACK_FILL = '#0b0b12';

    const GRADIENTS = [
      { name: '极光', css: 'linear-gradient(135deg, #0b1026 0%, #1b2a6b 42%, #0f6b7a 100%)' },
      { name: '暮色', css: 'linear-gradient(135deg, #3b1f4e 0%, #7a3c6d 48%, #e08a72 100%)' },
      { name: '青柠', css: 'linear-gradient(135deg, #06251f 0%, #10604e 50%, #9ad39a 100%)' },
      { name: '海盐', css: 'linear-gradient(135deg, #0a2540 0%, #1266a3 55%, #a8d8f0 100%)' },
      { name: '石墨', css: 'linear-gradient(135deg, #16181d 0%, #2c3138 55%, #4a525c 100%)' },
      { name: '樱雾', css: 'linear-gradient(135deg, #2a1030 0%, #6f2b58 50%, #f4b9c8 100%)' },
    ];

    const DEFAULTS = {
      enabled: true,
      source: 'none',
      gradient: 0,
      dim: 0.35,
      blur: 0,
      fit: 'cover',
      surface: 30,
      imageName: '',
      videoName: '',
    };

    const DICT = {
      en: {
        open: 'Wallpaper', title: 'Wallpaper',
        subtitle: 'Turn your own image or video into the Harness background.',
        image: 'Image', video: 'Video', pickImage: 'Choose image', pickVideo: 'Choose video',
        remove: 'Remove', gradients: 'Presets', dim: 'Veil', blur: 'Blur', fit: 'Fill',
        cover: 'Cover', contain: 'Fit', enabled: 'Enable wallpaper',
        surface: 'Surface opacity',
        hint: 'Files stay in this browser (IndexedDB) and are never uploaded. Dialogs and approval prompts always keep a readable body.',
        close: 'Close', clear: 'Reset all', importing: 'Importing…',
        tooBig: 'That file is too large (limit 200 MB).', failed: 'Could not save the media.',
        imageReady: 'Image ready', videoReady: 'Video ready',
      },
      zh: {
        open: '美化', title: '壁纸美化',
        subtitle: '把自己的图片或视频变成 Harness 背景。',
        image: '图片', video: '视频', pickImage: '选择图片', pickVideo: '选择视频',
        remove: '移除', gradients: '预设渐变', dim: '遮罩', blur: '模糊', fit: '填充',
        cover: '铺满', contain: '适应', enabled: '启用壁纸',
        surface: '面板不透明度',
        hint: '文件只保存在本机浏览器（IndexedDB），不会上传。弹窗、审批与提问卡片始终保持可读底色。',
        close: '关闭', clear: '全部重置', importing: '正在导入…',
        tooBig: '文件太大（上限 200 MB）。', failed: '保存素材失败。',
        imageReady: '图片已就绪', videoReady: '视频已就绪',
      },
    };

    const MAX_BYTES = 200 * 1024 * 1024;

    /* ------------------------------- settings ------------------------------- */

    function loadSettings() {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return { ...DEFAULTS };
        const parsed = JSON.parse(raw);
        return { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
      } catch (_error) {
        return { ...DEFAULTS };
      }
    }

    function saveSettings(settings) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch (_error) {
        /* storage may be unavailable; this page still shows the wallpaper */
      }
    }

    /* -------------------------------- media DB ------------------------------- */

    function openDb() {
      return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('IndexedDB is unavailable'));
          return;
        }
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async function dbWrite(key, value) {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    }

    async function dbRead(key) {
      const db = await openDb();
      const value = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const request = tx.objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return value;
    }

    async function dbDelete(key) {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }

    /* ------------------------------- controller ------------------------------ */

    let controller = null;

    function createController(ctx) {
      const listeners = new Set();
      const state = {
        settings: loadSettings(),
        urls: { image: '', video: '' },
        panelOpen: false,
        busy: false,
        error: '',
      };

      let wallEl = null;
      let veilEl = null;
      let mediaEl = null;
      let mediaKey = '';
      let tokenDispose = null;
      let tokenOn = false;
      let appliedSurface = -1;
      let applying = false;
      let disposed = false;

      function emit() {
        if (disposed) return;
        for (const listener of [...listeners]) {
          try {
            listener();
          } catch (_error) {
            /* a broken subscriber must not stop the rest */
          }
        }
      }

      function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }

      function isLight() {
        try {
          const snapshot = ctx.theme && ctx.theme.getTheme ? ctx.theme.getTheme() : null;
          const scheme = snapshot && snapshot.active ? snapshot.active.colorScheme : null;
          return scheme !== 'dark';
        } catch (_error) {
          return true;
        }
      }

      /* Root canvas fill: whatever happens with the layers, the page never shows
         the desktop through an emptied shell. */
      function paintRoot(value) {
        try {
          document.documentElement.style.background = value || '';
        } catch (_error) {
          /* ignore */
        }
      }

      /* Every surface the design system paints is redirected through this layer:
         the shell becomes fully transparent (the wallpaper shows as-is) and
         dialogs, cards, menus, inputs and toasts become translucent glass whose
         body is the user's "surface opacity". Calling overrideTokens again with
         the same source replaces the whole layer, which is how the slider works
         without touching the registry. */
      function surfaceTokens() {
        const alpha = Math.max(0, Math.min(100, Number(state.settings.surface))) / 100;
        const pair = (value) => ({
          light: 'rgba(255, 255, 255, ' + value + ')',
          dark: 'rgba(22, 24, 30, ' + value + ')',
        });
        /* Ambient surfaces follow the slider; anything that carries a question,
           an approval or a menu keeps a readability floor so it never washes out
           over the wallpaper. */
        const ambient = pair(alpha);
        const readable = pair(Math.min(1, Math.max(alpha, 0.88)));
        const soft = pair(Math.min(1, Math.max(alpha + 0.08, 0.3)));
        const code = pair(Math.min(1, Math.max(alpha + 0.45, 0.8)));
        const solid = pair(1);
        const scrim = { light: 'rgba(0, 0, 0, 0.18)', dark: 'rgba(0, 0, 0, 0.38)' };
        const clear = { light: 'transparent', dark: 'transparent' };
        return {
          /* the shell itself: fully transparent so the wallpaper shows through */
          '--dsw-alias-bg-base': clear,
          '--dsw-specific-sidebar-fill': clear,
          /* dialogs, cards, menus, popovers, toasts: readability floor */
          '--dsw-alias-bg-layer-1': readable,
          '--dsw-alias-bg-layer-2': readable,
          '--dsw-alias-bg-layer-3': readable,
          '--dsw-alias-bg-overlay': readable,
          '--dsw-alias-bg-module-platform': readable,
          '--dsw-alias-bg-document-preview': readable,
          '--dsw-alias-bg-multi-select': soft,
          '--dsw-alias-bg-document-selection': soft,
          '--dsw-alias-bg-skeleton': soft,
          '--dsw-specific-menu': readable,
          '--dsw-specific-selector': readable,
          '--dsw-specific-tip': readable,
          '--dsw-specific-sidebar-nav-item-active': soft,
          '--dsw-menu-surface-fill': readable,
          '--dsw-alias-toast-bg': readable,
          /* ambient surfaces keep following the slider */
          '--dsw-specific-bubble': ambient,
          '--dsw-specific-bubble-highlight': ambient,
          '--dsw-specific-input-major': ambient,
          '--dsw-specific-login-input': ambient,
          /* code keeps a strong body so it stays legible over the media */
          '--dsw-alias-markdown-code-block': code,
          '--dsw-alias-markdown-code-block-banner': code,
          '--dsw-alias-markdown-inline-code': code,
          '--dsw-alias-markdown-code-segment-selected': code,
          '--dsw-alias-markdown-code-segment-unselected': code,
          /* controls and interaction tints stay translucent */
          '--dsw-alias-button-elevated-fill': soft,
          '--dsw-alias-button-floating-fill': readable,
          '--dsw-alias-button-floating-hover': readable,
          '--dsw-alias-button-tool-bar-fill': soft,
          '--dsw-alias-button-tool-bar-hover': soft,
          '--dsw-alias-button-contrast-fill': solid,
          '--dsw-alias-interactive-bg-hover': soft,
          '--dsw-alias-interactive-bg-active': soft,
          '--dsw-alias-interactive-bg-hover-accent': soft,
          '--dsw-alias-interactive-bg-hover-solid': soft,
          '--dsw-alias-interactive-bg-hover-danger': soft,
          /* modal scrims dim the media instead of hiding it */
          '--dsw-alias-bg-mask-1': scrim,
          '--dsw-alias-bg-mask-2': scrim,
          '--dsw-alias-bg-mask-3': scrim,
          '--dsw-alias-bg-mask-drop': scrim,
        };
      }

      /* The flag flips BEFORE the call on purpose: overrideTokens publishes
         theme/change synchronously, and that listener must never re-enter. */
      function applySurfaceTokens() {
        if (!ctx.theme || typeof ctx.theme.overrideTokens !== 'function') return;
        const alpha = Math.max(0, Math.min(100, Number(state.settings.surface))) / 100;
        /* Re-publishing the layer on every unrelated apply costs a full token
           re-application across the app, so only do it when the value moved. */
        if (tokenOn && appliedSurface === alpha) return;
        appliedSurface = alpha;
        const layer = surfaceTokens();
        const wasOn = tokenOn;
        tokenOn = true;
        try {
          tokenDispose = ctx.theme.overrideTokens(NS, layer);
        } catch (_error) {
          tokenDispose = null;
          tokenOn = wasOn;
          appliedSurface = -1;
        }
      }

      function clearSurfaceTokens() {
        if (!tokenOn) return;
        tokenOn = false;
        appliedSurface = -1;
        const dispose = tokenDispose;
        tokenDispose = null;
        if (dispose) {
          try {
            dispose();
          } catch (_error) {
            /* the layer may already be gone */
          }
        }
      }

      function ensureWall() {
        if (wallEl && wallEl.isConnected) return wallEl;
        const existing = document.getElementById(WALL_ID);
        if (existing) {
          wallEl = existing;
          veilEl = existing.firstChild || null;
          return wallEl;
        }
        wallEl = document.createElement('div');
        wallEl.id = WALL_ID;
        wallEl.setAttribute('aria-hidden', 'true');
        Object.assign(wallEl.style, {
          position: 'fixed',
          left: '0px',
          top: '0px',
          right: '0px',
          bottom: '0px',
          width: '100vw',
          height: '100vh',
          zIndex: '-1',
          overflow: 'hidden',
          pointerEvents: 'none',
          background: FALLBACK_FILL,
          display: 'block',
        });
        veilEl = document.createElement('div');
        Object.assign(veilEl.style, {
          position: 'absolute',
          left: '0px',
          top: '0px',
          right: '0px',
          bottom: '0px',
        });
        wallEl.appendChild(veilEl);
        document.body.insertBefore(wallEl, document.body.firstChild);
        return wallEl;
      }

      function wallVisible() {
        const s = state.settings;
        if (!s.enabled || s.source === 'none') return false;
        if (s.source === 'image') return Boolean(state.urls.image);
        if (s.source === 'video') return Boolean(state.urls.video);
        return true;
      }

      function dropMedia() {
        if (!mediaEl) return;
        if (mediaEl.tagName === 'VIDEO') {
          try {
            mediaEl.pause();
            mediaEl.removeAttribute('src');
            mediaEl.load();
          } catch (_error) {
            /* ignore */
          }
        }
        mediaEl.remove();
        mediaEl = null;
        mediaKey = '';
      }

      /* One media element per (source, url) pair: rebuilding it on every apply is
         what multiplied WebMediaPlayers when the shell re-published its theme. */
      function renderMedia() {
        const s = state.settings;
        const url = s.source === 'image' ? state.urls.image : s.source === 'video' ? state.urls.video : '';
        const key = url ? s.source + '|' + url : '';
        if (!key) {
          dropMedia();
          return;
        }
        if (mediaEl && mediaKey === key) {
          applyMediaStyle();
          return;
        }
        dropMedia();
        mediaKey = key;
        if (s.source === 'image') {
          const img = document.createElement('img');
          img.src = url;
          img.alt = '';
          mediaEl = img;
        } else {
          const video = document.createElement('video');
          video.muted = true;
          video.loop = true;
          video.autoplay = true;
          video.playsInline = true;
          video.setAttribute('muted', '');
          video.setAttribute('playsinline', '');
          video.setAttribute('disablepictureinpicture', '');
          video.src = url;
          mediaEl = video;
          const started = video.play();
          if (started && typeof started.catch === 'function') started.catch(() => undefined);
        }
        wallEl.insertBefore(mediaEl, veilEl);
        applyMediaStyle();
      }

      function applyMediaStyle() {
        if (!mediaEl) return;
        const s = state.settings;
        Object.assign(mediaEl.style, {
          position: 'absolute',
          left: '0px',
          top: '0px',
          width: '100%',
          height: '100%',
          objectFit: s.fit === 'contain' ? 'contain' : 'cover',
          filter: Number(s.blur) > 0 ? 'blur(' + Number(s.blur) + 'px)' : 'none',
          transform: Number(s.blur) > 0 ? 'scale(1.08)' : 'none',
        });
      }

      function paintVeil() {
        if (!veilEl) return;
        const dim = Math.max(0, Math.min(0.9, Number(state.settings.dim) || 0));
        const light = isLight();
        veilEl.style.background = 'rgba(' + (light ? '255,255,255' : '0,0,0') + ', ' + dim + ')';
        /* The control panel must stay readable even when every other surface is
           fully transparent, so it reads this private token instead. */
        try {
          document.documentElement.style.setProperty(
            '--dsh-beautify-card',
            light ? 'rgba(255, 255, 255, 0.94)' : 'rgba(20, 22, 28, 0.94)',
          );
          document.documentElement.style.setProperty(
            '--dsh-beautify-solid',
            light ? '#ffffff' : '#16181e',
          );
          document.documentElement.style.setProperty(
            '--dsh-beautify-soft',
            light ? 'rgba(255, 255, 255, 0.96)' : 'rgba(22, 24, 30, 0.97)',
          );
        } catch (_error) {
          /* ignore */
        }
      }

      function apply() {
        if (applying || disposed) return;
        applying = true;
        try {
          if (typeof document === 'undefined' || !document.body) return;
          const s = state.settings;
          if (!wallVisible()) {
            if (wallEl) wallEl.style.display = 'none';
            clearSurfaceTokens();
            paintRoot('');
            paintVeil();
            return;
          }
          ensureWall();
          wallEl.style.display = 'block';

          if (s.source === 'gradient') {
            dropMedia();
            const gradient = GRADIENTS[s.gradient] || GRADIENTS[0];
            wallEl.style.background = gradient.css;
            paintRoot(gradient.css);
          } else {
            wallEl.style.background = FALLBACK_FILL;
            paintRoot(FALLBACK_FILL);
            renderMedia();
          }
          paintVeil();

          const rect = wallEl.getBoundingClientRect();
          if (rect.width > 8 && rect.height > 8) applySurfaceTokens();
          else clearSurfaceTokens();
          syncOpaqueDialogs();
        } catch (_error) {
          clearSurfaceTokens();
          paintRoot('');
        } finally {
          applying = false;
          emit();
        }
      }

      function updateThemeTone() {
        if (applying) return;
        try {
          paintVeil();
          syncOpaqueDialogs();
        } catch (_error) {
          /* ignore */
        }
      }

      /* ---- settings stays readable -------------------------------------------
         The Settings page is a role="dialog" frame that paints itself with the
         same surface tokens this plugin makes translucent, so it has to opt out.
         Its title element keeps the CSS-module name `navTitle` in every build,
         which identifies the frame without a hardcoded hash or localized text. */
      const opaqueDialogs = new Set();
      let dialogObserver = null;
      let dialogSyncQueued = false;

      function isSettingsFrame(el) {
        try {
          if (!el || el.getAttribute('role') !== 'dialog') return false;
          return el.querySelector('[class*="navTitle"]') !== null;
        } catch (_error) {
          return false;
        }
      }

      function restoreDialogs() {
        for (const el of [...opaqueDialogs]) {
          try {
            el.style.removeProperty('background');
            el.style.removeProperty('backdrop-filter');
            delete el.dataset.dshBeautifyOpaque;
          } catch (_error) {
            /* ignore */
          }
        }
        opaqueDialogs.clear();
      }

      function syncOpaqueDialogs() {
        if (disposed) return;
        if (!tokenOn || typeof document === 'undefined') {
          restoreDialogs();
          return;
        }
        try {
          const frames = document.querySelectorAll('[role="dialog"][aria-modal="true"], [role="alertdialog"]');
          const current = new Set(frames);
          for (const el of frames) {
            const settings = isSettingsFrame(el);
            /* Settings is a reading page, so it goes fully solid; every other
               modal (approval requests, confirmations, question cards) keeps a
               near-opaque body so the question never washes out. */
            const token = settings ? '--dsh-beautify-solid' : '--dsh-beautify-soft';
            if (!opaqueDialogs.has(el)) opaqueDialogs.add(el);
            el.dataset.dshBeautifyOpaque = settings ? 'settings' : 'dialog';
            el.style.setProperty('background', 'var(' + token + ')', 'important');
          }
          for (const el of [...opaqueDialogs]) {
            if (current.has(el)) continue;
            try {
              el.style.removeProperty('background');
              delete el.dataset.dshBeautifyOpaque;
            } catch (_error) {
              /* ignore */
            }
            opaqueDialogs.delete(el);
          }
        } catch (_error) {
          /* ignore */
        }
      }

      async function hydrate() {
        /* An import can land while these reads are in flight; never replace a
           URL somebody already owns. */
        try {
          const image = await dbRead('image');
          if (!state.urls.image && image instanceof Blob) state.urls.image = URL.createObjectURL(image);
        } catch (_error) {
          /* a missing row is normal */
        }
        try {
          const video = await dbRead('video');
          if (!state.urls.video && video instanceof Blob) state.urls.video = URL.createObjectURL(video);
        } catch (_error) {
          /* a missing row is normal */
        }
        if (disposed) return;
        apply();
      }

      function revoke(kind) {
        const url = state.urls[kind];
        if (!url) return;
        try {
          URL.revokeObjectURL(url);
        } catch (_error) {
          /* ignore */
        }
        state.urls[kind] = '';
      }

      async function importFile(kind, file) {
        if (!file) return;
        state.error = '';
        if (file.size > MAX_BYTES) {
          state.error = 'tooBig';
          emit();
          return;
        }
        state.busy = true;
        emit();
        try {
          await dbWrite(kind, file);
          revoke(kind);
          dropMedia();
          state.urls[kind] = URL.createObjectURL(file);
          state.settings = {
            ...state.settings,
            enabled: true,
            source: kind,
            imageName: kind === 'image' ? file.name : state.settings.imageName,
            videoName: kind === 'video' ? file.name : state.settings.videoName,
          };
          saveSettings(state.settings);
        } catch (_error) {
          state.error = 'failed';
        }
        state.busy = false;
        apply();
      }

      async function removeMedia(kind) {
        try {
          await dbDelete(kind);
        } catch (_error) {
          /* removing a missing row is fine */
        }
        revoke(kind);
        dropMedia();
        if (state.settings.source === kind) state.settings = { ...state.settings, source: 'none' };
        saveSettings(state.settings);
        apply();
      }

      function setSettings(patch) {
        state.settings = { ...state.settings, ...patch };
        saveSettings(state.settings);
        apply();
      }

      async function resetAll() {
        await removeMedia('image');
        await removeMedia('video');
        state.settings = { ...DEFAULTS, source: 'none' };
        saveSettings(state.settings);
        apply();
      }

      function isPanelOpen() {
        return state.panelOpen;
      }

      function openPanel() {
        state.panelOpen = true;
        emit();
      }

      function closePanel() {
        state.panelOpen = false;
        emit();
      }

      function togglePanel() {
        state.panelOpen = !state.panelOpen;
        emit();
      }

      /* Chat streaming mutates the DOM constantly, so a mutation only schedules a
         coalesced pass instead of re-scanning on every batch. */
      function scheduleDialogSync() {
        if (dialogSyncQueued || disposed) return;
        dialogSyncQueued = true;
        const run = () => {
          dialogSyncQueued = false;
          syncOpaqueDialogs();
        };
        try {
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
          else setTimeout(run, 120);
        } catch (_error) {
          dialogSyncQueued = false;
        }
      }

      function mount() {
        apply();
        hydrate();
        syncOpaqueDialogs();
        try {
          if (typeof MutationObserver !== 'undefined' && document.body) {
            dialogObserver = new MutationObserver(() => scheduleDialogSync());
            dialogObserver.observe(document.body, { childList: true, subtree: true });
          }
        } catch (_error) {
          dialogObserver = null;
        }
        if (ctx && typeof ctx.on === 'function') {
          /* Only the veil colour follows the theme; routing this into apply()
             re-entered overrideTokens from inside its own publish(). */
          ctx.on('theme/change', updateThemeTone);
          ctx.on('locale/change', emit);
        }
      }

      function dispose() {
        disposed = true;
        listeners.clear();
        try {
          if (dialogObserver) dialogObserver.disconnect();
        } catch (_error) {
          /* ignore */
        }
        dialogObserver = null;
        restoreDialogs();
        revoke('image');
        revoke('video');
        dropMedia();
        clearSurfaceTokens();
        paintRoot('');
        if (wallEl && wallEl.parentNode) wallEl.parentNode.removeChild(wallEl);
        wallEl = null;
        veilEl = null;
        tokenDispose = null;
      }

      return {
        state,
        subscribe,
        mount,
        dispose,
        apply,
        importFile,
        removeMedia,
        setSettings,
        resetAll,
        isPanelOpen,
        openPanel,
        closePanel,
        togglePanel,
      };
    }

    /* -------------------------------- i18n ---------------------------------- */

    function currentLanguage(ctx) {
      try {
        const snapshot = ctx.locale && ctx.locale.getLocale ? ctx.locale.getLocale() : null;
        const id =
          (snapshot && (snapshot.id || snapshot.locale || snapshot.language || (snapshot.active && snapshot.active.id))) || '';
        if (String(id).toLowerCase().startsWith('zh')) return 'zh';
        if (String(id).toLowerCase().startsWith('en')) return 'en';
      } catch (_error) {
        /* fall through */
      }
      try {
        return String(navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
      } catch (_error) {
        return 'en';
      }
    }

    function createTranslator(ctx) {
      let bound = null;
      try {
        if (ctx.locale && typeof ctx.locale.bind === 'function') bound = ctx.locale.bind(NS);
      } catch (_error) {
        bound = null;
      }
      return function translate(key) {
        if (bound) {
          try {
            const value = bound(key);
            if (typeof value === 'string' && value !== key) return value;
          } catch (_error) {
            /* fall back to the local dictionary */
          }
        }
        const dict = DICT[currentLanguage(ctx)] || DICT.en;
        return dict[key] || DICT.en[key] || key;
      };
    }

    /* ------------------------------- components ------------------------------ */

    const S = {
      pill: {
        display: 'inline-flex', alignItems: 'center', gap: '6px', height: '24px', padding: '0 10px',
        borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l3, rgba(0,0,0,.12))',
        background: 'var(--dsw-alias-button-tool-bar-fill, rgba(0,0,0,.04))',
        color: 'var(--dsw-alias-label-primary, #1f2329)', font: 'inherit', fontSize: '12px',
        lineHeight: '1', cursor: 'pointer', userSelect: 'none',
      },
      dot: {
        width: '6px', height: '6px', borderRadius: '50%',
        background: 'var(--dsw-alias-brand-primary, #3964fe)',
      },
      backdrop: {
        position: 'fixed', inset: '0', zIndex: '30', pointerEvents: 'auto',
        background: 'var(--dsw-alias-bg-mask-2, rgba(0,0,0,.32))',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      },
      card: {
        width: 'min(460px, 100%)', maxHeight: 'min(640px, 88vh)', overflowY: 'auto', pointerEvents: 'auto',
        background: 'var(--dsh-beautify-card, var(--dsw-alias-bg-layer-1, #ffffff))',
        backdropFilter: 'blur(18px)',
        color: 'var(--dsw-alias-label-primary, #1f2329)',
        border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))',
        borderRadius: '16px',
        boxShadow: 'var(--dsw-shadow-lv3, 0 18px 48px rgba(0,0,0,.28))',
        padding: '18px 18px 14px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px',
      },
      header: { display: 'flex', alignItems: 'flex-start', gap: '10px' },
      title: { fontSize: '15px', fontWeight: 600, lineHeight: '20px' },
      subtitle: { color: 'var(--dsw-alias-label-tertiary, #6b7280)', fontSize: '12px', lineHeight: '18px', marginTop: '2px' },
      section: { display: 'flex', flexDirection: 'column', gap: '8px' },
      sectionTitle: {
        fontSize: '11px', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-tertiary, #6b7280)',
      },
      row: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
      button: {
        display: 'inline-flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 12px',
        borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l3, rgba(0,0,0,.12))',
        background: 'var(--dsw-alias-button-elevated-fill, rgba(0,0,0,.03))',
        color: 'var(--dsw-alias-label-primary, #1f2329)', font: 'inherit', fontSize: '12.5px', cursor: 'pointer',
      },
      ghost: {
        height: '28px', padding: '0 10px', borderRadius: '999px', border: '1px solid transparent',
        background: 'transparent', color: 'var(--dsw-alias-label-secondary, #4b5563)',
        font: 'inherit', fontSize: '12px', cursor: 'pointer',
      },
      chip: {
        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '10px',
        border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))',
        background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,.02))',
      },
      thumb: { width: '54px', height: '32px', borderRadius: '6px', objectFit: 'cover', flex: '0 0 auto' },
      meta: { flex: '1 1 auto', minWidth: '0', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      swatchRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
      swatch: (active) => ({
        width: '46px', height: '30px', borderRadius: '8px', cursor: 'pointer', padding: '0',
        border: active
          ? '2px solid var(--dsw-alias-brand-primary, #3964fe)'
          : '1px solid var(--dsw-alias-border-l3, rgba(0,0,0,.14))',
      }),
      control: { display: 'grid', gridTemplateColumns: '64px 1fr 44px', alignItems: 'center', gap: '10px' },
      range: { width: '100%', accentColor: 'var(--dsw-alias-brand-primary, #3964fe)' },
      value: { textAlign: 'right', color: 'var(--dsw-alias-label-tertiary, #6b7280)', fontVariantNumeric: 'tabular-nums' },
      note: { color: 'var(--dsw-alias-label-tertiary, #6b7280)', fontSize: '11.5px', lineHeight: '17px' },
      error: { color: 'var(--dsw-alias-state-error-primary, #d64545)', fontSize: '12px' },
      footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' },
    };

    function PaletteIcon(props) {
      const size = props && props.size ? props.size : 14;
      return h(
        'svg',
        {
          viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
          strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
        },
        h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 3 }),
        h('circle', { cx: 8.5, cy: 9.5, r: 1.6 }),
        h('path', { d: 'M4 17l5-4.2 3.4 2.8L16.5 11 20 14.4' }),
      );
    }

    let translateRef = (key) => key;

    function Launcher() {
      const [, bump] = useState(0);
      useEffect(() => {
        if (!controller) return undefined;
        return controller.subscribe(() => bump((n) => n + 1));
      }, []);
      const ctl = controller;
      if (!ctl) return null;
      const active = ctl.state.settings.enabled && ctl.state.settings.source !== 'none';
      return h(
        'button',
        {
          type: 'button',
          title: translateRef('title'),
          onClick: () => ctl.togglePanel(),
          style: S.pill,
          'aria-label': translateRef('title'),
        },
        h(PaletteIcon, { size: 13 }),
        h('span', null, translateRef('open')),
        active ? h('span', { style: S.dot }) : null,
      );
    }

    class Boundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { message: '' };
      }

      static getDerivedStateFromError(error) {
        return { message: String((error && error.message) || error).slice(0, 300) };
      }

      render() {
        if (this.state.message) {
          return h(
            'div',
            {
              style: {
                position: 'fixed', left: '12px', bottom: '12px', maxWidth: '60ch', zIndex: '40',
                padding: '10px 12px', borderRadius: '10px', font: '12px/1.5 ui-monospace, monospace',
                background: 'var(--dsw-alias-bg-layer-1, #fff)',
                border: '1px solid var(--dsw-alias-state-error-primary, #d64545)',
                color: 'var(--dsw-alias-label-primary, #1f2329)',
              },
            },
            'wallpaper plugin error: ' + this.state.message,
          );
        }
        return this.props.children;
      }
    }

    function Panel() {
      const [, bump] = useState(0);
      useEffect(() => {
        if (!controller) return undefined;
        return controller.subscribe(() => bump((n) => n + 1));
      }, []);
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape' && controller) controller.closePanel();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, []);
      const ctl = controller;
      if (!ctl || !ctl.isPanelOpen()) return null;
      const t = translateRef;
      const s = ctl.state.settings;
      const urls = ctl.state.urls;

      const onFile = (kind) => (event) => {
        const file = event.target.files && event.target.files[0];
        if (file) ctl.importFile(kind, file);
        event.target.value = '';
      };

      const mediaChip = (kind, url, name) => {
        if (!url) return null;
        return h(
          'div',
          { style: S.chip },
          kind === 'image'
            ? h('img', { src: url, alt: '', style: S.thumb })
            : h('video', { src: url, muted: true, loop: true, autoPlay: true, playsInline: true, style: S.thumb }),
          h('span', { style: S.meta, title: name }, name || t(kind === 'image' ? 'imageReady' : 'videoReady')),
          h('button', { type: 'button', style: S.ghost, onClick: () => ctl.removeMedia(kind) }, t('remove')),
        );
      };

      const slider = (key, label, min, max, step, format) => {
        const value = Number(s[key]) || 0;
        return h(
          'div',
          { style: S.control },
          h('span', { style: { color: 'var(--dsw-alias-label-secondary, #4b5563)' } }, label),
          h('input', {
            type: 'range', min, max, step, value, style: S.range,
            onChange: (event) => ctl.setSettings({ [key]: Number(event.target.value) }),
          }),
          h('span', { style: S.value }, format(value)),
        );
      };

      return h(
        'div',
        {
          style: S.backdrop,
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) ctl.closePanel();
          },
        },
        h(
          'div',
          { style: S.card, role: 'dialog', 'aria-modal': 'true', 'aria-label': t('title') },
          h(
            'div',
            { style: S.header },
            h('div', { style: { flex: '1 1 auto' } },
              h('div', { style: S.title }, t('title')),
              h('div', { style: S.subtitle }, t('subtitle')),
            ),
            h('button', { type: 'button', style: S.ghost, onClick: () => ctl.closePanel(), 'aria-label': t('close') }, '✕'),
          ),

          h('div', { style: S.section },
            h('div', { style: S.sectionTitle }, t('image')),
            h('div', { style: S.row },
              h('label', { style: { ...S.button, cursor: 'pointer' } },
                h('span', null, '🖼'),
                t('pickImage'),
                h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: onFile('image') }),
              ),
            ),
            mediaChip('image', urls.image, s.imageName),
          ),

          h('div', { style: S.section },
            h('div', { style: S.sectionTitle }, t('video')),
            h('div', { style: S.row },
              h('label', { style: { ...S.button, cursor: 'pointer' } },
                h('span', null, '🎬'),
                t('pickVideo'),
                h('input', { type: 'file', accept: 'video/*', style: { display: 'none' }, onChange: onFile('video') }),
              ),
            ),
            mediaChip('video', urls.video, s.videoName),
          ),

          h('div', { style: S.section },
            h('div', { style: S.sectionTitle }, t('gradients')),
            h('div', { style: S.swatchRow },
              GRADIENTS.map((gradient, index) =>
                h('button', {
                  key: gradient.name, type: 'button', title: gradient.name, 'aria-label': gradient.name,
                  style: { ...S.swatch(s.source === 'gradient' && s.gradient === index), background: gradient.css },
                  onClick: () => ctl.setSettings({ source: 'gradient', gradient: index, enabled: true }),
                }),
              ),
            ),
          ),

          h('div', { style: S.section },
            slider('dim', t('dim'), 0, 0.9, 0.05, (v) => Math.round(v * 100) + '%'),
            slider('blur', t('blur'), 0, 24, 1, (v) => v + 'px'),
            slider('surface', t('surface'), 0, 100, 5, (v) => v + '%'),
            h('div', { style: S.control },
              h('span', { style: { color: 'var(--dsw-alias-label-secondary, #4b5563)' } }, t('fit')),
              h('div', { style: { display: 'flex', gap: '6px' } },
                h('button', { type: 'button', style: { ...S.button, height: '26px', opacity: s.fit === 'cover' ? 1 : 0.6 }, onClick: () => ctl.setSettings({ fit: 'cover' }) }, t('cover')),
                h('button', { type: 'button', style: { ...S.button, height: '26px', opacity: s.fit === 'contain' ? 1 : 0.6 }, onClick: () => ctl.setSettings({ fit: 'contain' }) }, t('contain')),
              ),
              h('span', null),
            ),
            h('label', { style: { ...S.row, cursor: 'pointer' } },
              h('input', { type: 'checkbox', checked: Boolean(s.enabled), onChange: (event) => ctl.setSettings({ enabled: event.target.checked }) }),
              h('span', null, t('enabled')),
            ),
          ),

          ctl.state.busy ? h('div', { style: S.note }, t('importing')) : null,
          ctl.state.error ? h('div', { style: S.error }, t(ctl.state.error)) : null,

          h('div', { style: S.footer },
            h('div', { style: S.note }, t('hint')),
            h('button', { type: 'button', style: S.ghost, onClick: () => ctl.resetAll() }, t('clear')),
          ),
        ),
      );
    }

    /* --------------------------------- plugin -------------------------------- */

    return {
      inject: ['slots', 'theme', 'locale'],
      apply(ctx) {
        controller = createController(ctx);
        translateRef = createTranslator(ctx);
        try {
          window.__DSH_BEAUTIFY__ = controller;
        } catch (_error) {
          /* a debugging handle is optional */
        }

        ctx.effect(() => {
          controller.mount();
          return () => {
            if (controller) controller.dispose();
            controller = null;
          };
        });

        try {
          if (ctx.locale && typeof ctx.locale.register === 'function') {
            ctx.locale.register(NS, 'en', DICT.en);
            ctx.locale.register(NS, 'zh', DICT.zh);
          }
        } catch (_error) {
          /* the local fallback covers a missing dictionary */
        }

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'beautify.panel', order: 240 }, function PanelEntry() {
            return h(Boundary, null, h(Panel));
          }),
        );
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register({ name: 'conversation.composer.dock', id: 'beautify.launcher', order: 90 }, Launcher),
        );
      },
    };
  },
});
