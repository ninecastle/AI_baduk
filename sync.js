/* sync.js — Firebase(구글 로그인 + Firestore)로 기보함·사활 진도·설정을 기기 간 동기화
   window.FIREBASE_CONFIG 가 있을 때만 동작 (GitHub Pages 설치형 앱). 없으면 설정 화면에 안내만 표시. */
(function () {
  'use strict';
  const A = window.BadukApp;
  const cfg = window.FIREBASE_CONFIG || null;
  const SDK = [
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
  ];
  let fb = null, db = null, user = null, status = cfg ? 'off' : 'none', lastSync = null, unsub = [];
  let pending = new Set(), timer = null;
  const listeners = [];
  const onChange = fn => listeners.push(fn);
  const emit = () => { listeners.forEach(fn => { try { fn(); } catch (_) { } }); if (A && A.syncChanged) A.syncChanged(); };

  function loadScript(url) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = url; s.onload = res; s.onerror = () => rej(new Error('load ' + url)); document.head.appendChild(s); }); }
  async function init() {
    if (!cfg) return;
    try {
      for (const u of SDK) await loadScript(u);
      fb = window.firebase; fb.initializeApp(cfg);
      db = fb.firestore();
      try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) { console.warn('persistence', e && e.code); }
      fb.auth().onAuthStateChanged(u => { user = u; if (u) start(); else stop(); emit(); });
      status = 'ready'; emit();
    } catch (err) { console.warn('Firebase init failed', err); status = 'error'; emit(); }
  }
  async function signIn() {
    if (!fb) return;
    const provider = new fb.auth.GoogleAuthProvider();
    try { await fb.auth().signInWithPopup(provider); }
    catch (e) { if (e && /popup/.test(e.code || '')) await fb.auth().signInWithRedirect(provider); else { A.toast('로그인에 실패했어요: ' + (e.message || e)); } }
  }
  async function signOut() { if (fb) await fb.auth().signOut(); }

  const col = () => db.collection('users').doc(user.uid).collection('games');
  const doc = name => db.collection('users').doc(user.uid).collection('data').doc(name);

  async function start() {
    stop();
    status = 'syncing'; emit();
    try {
      // 1) 기보함 병합
      const snap = await col().get();
      const remote = new Map(); snap.forEach(d => remote.set(d.id, d.data()));
      const local = A.getArchive();
      const deleted = new Set(A.deletedIds());
      const merged = new Map();
      for (const e of local) merged.set(e.id, e);
      for (const [id, r] of remote) {
        if (deleted.has(id)) { col().doc(id).delete().catch(() => { }); continue; }
        const l = merged.get(id);
        if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) merged.set(id, r);
      }
      const list = [...merged.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      A.replaceArchive(list);
      // 로컬에만 있거나 더 새로운 것 업로드
      const batch = db.batch(); let n = 0;
      for (const e of list) { const r = remote.get(e.id); if (!r || (e.updatedAt || 0) > (r.updatedAt || 0)) { batch.set(col().doc(e.id), slim(e)); n++; } }
      if (n) await batch.commit();
      // 2) 사활 진도 병합 (문제별 최신)
      const tsDoc = await doc('tsumego').get();
      const rp = tsDoc.exists ? (tsDoc.data().progress || {}) : {};
      const lp = window.TsumegoUI ? window.TsumegoUI.getProgress() : {};
      const mp = Object.assign({}, lp);
      for (const id in rp) { const a = lp[id], b = rp[id]; if (!a || (b.last || '') > (a.last || '')) mp[id] = b; else if (a && b) mp[id] = { solved: Math.max(a.solved || 0, b.solved || 0), failed: Math.max(a.failed || 0, b.failed || 0), last: a.last > b.last ? a.last : b.last }; }
      if (window.TsumegoUI) window.TsumegoUI.replaceProgress(mp);
      await doc('tsumego').set({ progress: mp, updatedAt: Date.now() });
      // 2-1) 배우기 진도 병합 (완료는 어느 쪽이든 유지)
      if (window.Learn) {
        const lDoc = await doc('learn').get();
        const rl = lDoc.exists ? (lDoc.data().progress || {}) : {};
        const ll = window.Learn.getProgress();
        const ml = Object.assign({}, rl, ll);
        for (const id in rl) if (rl[id].done) ml[id] = Object.assign({}, ll[id], rl[id], { done: true });
        window.Learn.replaceProgress(ml);
        await doc('learn').set({ progress: ml, updatedAt: Date.now() });
      }
      // 3) 설정: 원격이 더 새로우면 가져오기
      const stDoc = await doc('settings').get();
      if (stDoc.exists && (stDoc.data().updatedAt || 0) > (A.store.get('settingsUpdatedAt', 0))) A.replaceSettings(stDoc.data().settings || {});
      else await doc('settings').set({ settings: A.settings, updatedAt: Date.now() });
      // 실시간 감시
      unsub.push(col().onSnapshot(s => {
        if (s.metadata.hasPendingWrites) return;
        let changed = false; const cur = new Map(A.getArchive().map(e => [e.id, e]));
        s.docChanges().forEach(ch => {
          const d = ch.doc.data(); const l = cur.get(ch.doc.id);
          if (ch.type === 'removed') { if (l) { cur.delete(ch.doc.id); changed = true; } }
          else if (!l || (d.updatedAt || 0) > (l.updatedAt || 0)) { cur.set(ch.doc.id, d); changed = true; }
        });
        if (changed) A.replaceArchive([...cur.values()].sort((a, b) => (b.date || '').localeCompare(a.date || '')));
      }));
      unsub.push(doc('tsumego').onSnapshot(s => { if (s.metadata.hasPendingWrites || !s.exists || !window.TsumegoUI) return; const rp2 = s.data().progress || {}; const lp2 = window.TsumegoUI.getProgress(); const mp2 = Object.assign({}, lp2); let ch = false; for (const id in rp2) { if (!lp2[id] || (rp2[id].last || '') > (lp2[id].last || '')) { mp2[id] = rp2[id]; ch = true; } } if (ch) window.TsumegoUI.replaceProgress(mp2); }));
      lastSync = new Date(); status = 'on'; emit();
    } catch (err) { console.warn('sync failed', err); status = 'error'; emit(); }
  }
  function stop() { for (const u of unsub) { try { u(); } catch (_) { } } unsub = []; if (status !== 'none') status = fb ? 'ready' : 'off'; }
  function slim(e) { return JSON.parse(JSON.stringify(e)); } // undefined 제거
  function push(kind) {
    if (!db || !user) return;
    pending.add(kind);
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const kinds = [...pending]; pending.clear();
      try {
        for (const k of kinds) {
          if (k === 'archive') {
            const list = A.getArchive(); const deleted = new Set(A.deletedIds());
            const batch = db.batch(); let n = 0;
            for (const e of list) { batch.set(col().doc(e.id), slim(e)); n++; }
            for (const id of deleted) { batch.delete(col().doc(id)); n++; }
            if (n) await batch.commit();
          } else if (k === 'learn') { await doc('learn').set({ progress: window.Learn.getProgress(), updatedAt: Date.now() });
          } else if (k === 'tsumego') { await doc('tsumego').set({ progress: window.TsumegoUI.getProgress(), updatedAt: Date.now() }); }
          else if (k === 'settings') { const now = Date.now(); A.store.set('settingsUpdatedAt', now); await doc('settings').set({ settings: A.settings, updatedAt: now }); }
        }
        lastSync = new Date(); emit();
      } catch (err) { console.warn('push failed', err); }
    }, 1500);
  }
  window.Sync = { init, signIn, signOut, push, onChange, get status() { return status; }, get user() { return user; }, get lastSync() { return lastSync; }, enabled: !!cfg };
  init();
})();
