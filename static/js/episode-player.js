// Wires the build-time .episode-player markup (see modules/audio-player.njk).
// Plays the enclosure mp3 (traffic.megaphone.fm/<id>.mp3 — preserves Megaphone
// ads + download counting). Features: play/pause, scrub, ±15s skip, speed
// (incl. 0.8×), resume (localStorage), chapter list w/ auto-advance, up-next
// radio (related segments after a single segment ends), ?t=/&ch=/&end=
// deep-links, clip-to-share, and OS Media Session (lock-screen) controls.

(function () {
    'use strict';

    function fmt(s) {
        if (!isFinite(s) || s < 0) return '0:00';
        var m = Math.floor(s / 60), x = Math.floor(s % 60);
        return m + ':' + (x < 10 ? '0' : '') + x;
    }
    // "2m14s" / "1h2m3s" / "134" -> seconds
    function parseT(v) {
        if (!v) return 0;
        if (/^\d+(\.\d+)?$/.test(v)) return parseFloat(v);
        var s = 0, m;
        if (m = v.match(/(\d+)h/)) s += 3600 * +m[1];
        if (m = v.match(/(\d+)m/)) s += 60 * +m[1];
        if (m = v.match(/(\d+)s/)) s += +m[1];
        return s;
    }
    function mp3(id) {
        return 'https://www.podtrac.com/pts/redirect.mp3/traffic.megaphone.fm/' + id + '.mp3';
    }

    function init(el, applyUrl) {
        var chapters = [].slice.call(el.querySelectorAll('.ep-chap')).map(function (li) {
            return { id: li.dataset.id, title: (li.querySelector('.ep-chap-t') || {}).textContent || '', art: li.dataset.art || '' };
        });
        // Up-next radio queue (related segments) — played after the main track.
        var queue = [].slice.call(el.querySelectorAll('.ep-next')).map(function (li) {
            return { id: li.dataset.id, title: li.dataset.title || '', art: li.dataset.art || '' };
        });
        var all = chapters.concat(queue);
        if (!all.length) return;
        var multi = !el.classList.contains('episode-player--single') && chapters.length > 1;

        var Q = function (s) { return el.querySelector(s); };
        var audio = new Audio(); audio.preload = 'metadata';
        var play = Q('.ep-play'), bar = Q('.ep-bar'), fill = Q('.ep-fill'), buf = Q('.ep-buf'),
            curEl = Q('.ep-cur'), durEl = Q('.ep-dur'), now = Q('.ep-now'), spd = Q('.ep-spd');
        var speeds = [0.8, 1, 1.5, 2], si = 1, cur = -1, pend = null, tick = 0;
        var clipMode = false, clipA = null, clipB = null, stopAt = null;

        var qp = new URLSearchParams(applyUrl ? location.search : '');
        var startCh = Math.max(0, Math.min(all.length - 1, parseInt(qp.get('ch') || '0', 10) || 0));
        var startT = parseT(qp.get('t'));
        var clipEnd = qp.get('end') ? parseT(qp.get('end')) : null;
        clipB = clipEnd; stopAt = clipEnd;

        function toast(m) {
            var t = document.createElement('div'); t.className = 'ep-toast'; t.textContent = m;
            document.body.appendChild(t); setTimeout(function () { t.remove(); }, 1900);
        }
        function copy(s) { try { navigator.clipboard.writeText(s); } catch (e) { /* ignore */ } }
        function marks() {
            el.querySelectorAll('.ep-mark').forEach(function (m) { m.remove(); });
            var d = audio.duration || 0; if (!d) return;
            [clipA, clipB].forEach(function (t) {
                if (t == null) return;
                var m = document.createElement('div'); m.className = 'ep-mark';
                m.style.left = (t / d * 100) + '%'; bar.appendChild(m);
            });
        }
        function urlAt(a, b) {
            var u = new URL(location.href);
            u.searchParams.set('t', Math.round(a));
            if (b != null) u.searchParams.set('end', Math.round(b)); else u.searchParams.delete('end');
            if (multi && cur < chapters.length) u.searchParams.set('ch', cur);
            return u.toString();
        }
        function setChap(i) {
            el.querySelectorAll('.ep-chap').forEach(function (c) { c.classList.toggle('ep-cur', +c.dataset.i === i); });
        }
        function setMedia(i) {
            if (!('mediaSession' in navigator)) return;
            var t = all[i];
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: t.title, artist: 'Living on Earth', album: 'Living on Earth',
                    artwork: t.art ? [{ src: t.art, sizes: '512x512', type: 'image/jpeg' }] : []
                });
            } catch (e) { /* ignore */ }
        }
        function load(i, seek, auto) {
            cur = i;
            var radio = i >= chapters.length;
            pend = (seek != null) ? seek : (parseFloat(localStorage.getItem('ep-pos-' + all[i].id)) || 0);
            audio.src = mp3(all[i].id); audio.load();
            now.textContent = (radio ? '♫ ' : '') + all[i].title;
            el.classList.toggle('ep-radio-on', radio);
            durEl.textContent = '--:--'; curEl.textContent = '0:00';
            fill.style.right = '100%'; buf.style.right = '100%';
            setChap(radio ? -1 : i);
            setMedia(i);
            if (radio) toast('Up next — playing a related segment');
            if (auto) audio.play();
        }

        audio.addEventListener('loadedmetadata', function () {
            durEl.textContent = fmt(audio.duration);
            if (pend != null) { try { audio.currentTime = pend; } catch (e) { /* ignore */ } pend = null; }
            marks();
        });
        audio.addEventListener('timeupdate', function () {
            var d = audio.duration || 1;
            fill.style.right = (100 - audio.currentTime / d * 100) + '%';
            curEl.textContent = fmt(audio.currentTime);
            if (audio.buffered.length) buf.style.right = (100 - audio.buffered.end(audio.buffered.length - 1) / d * 100) + '%';
            if (++tick % 10 === 0) localStorage.setItem('ep-pos-' + all[cur].id, audio.currentTime);
            if (stopAt != null && audio.currentTime >= stopAt) { audio.pause(); stopAt = null; }
            if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && isFinite(audio.duration)) {
                try { navigator.mediaSession.setPositionState({ duration: audio.duration, position: audio.currentTime, playbackRate: audio.playbackRate }); } catch (e) { /* ignore */ }
            }
        });
        audio.addEventListener('play', function () {
            play.textContent = '❚❚'; play.setAttribute('aria-label', 'Pause');
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        });
        audio.addEventListener('pause', function () {
            play.textContent = '▶'; play.setAttribute('aria-label', 'Play');
            if (cur >= 0) localStorage.setItem('ep-pos-' + all[cur].id, audio.currentTime);
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        });
        audio.addEventListener('ended', function () {
            localStorage.removeItem('ep-pos-' + all[cur].id);
            if (cur < all.length - 1) load(cur + 1, 0, true);
        });

        play.addEventListener('click', function () { audio.paused ? audio.play() : audio.pause(); });
        Q('.ep-back').addEventListener('click', function () { audio.currentTime = Math.max(0, audio.currentTime - 15); });
        Q('.ep-fwd').addEventListener('click', function () { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); });
        bar.addEventListener('click', function (e) {
            var r = bar.getBoundingClientRect(), t = (e.clientX - r.left) / r.width * (audio.duration || 0);
            if (clipMode) {
                if (clipA == null) { clipA = t; marks(); toast('Start set — now click the end'); }
                else {
                    clipB = t; if (clipB < clipA) { var z = clipA; clipA = clipB; clipB = z; }
                    marks(); copy(urlAt(clipA, clipB)); clipMode = false;
                    Q('.ep-clip').classList.remove('ep-on');
                    toast('Clip link copied (' + fmt(clipA) + '–' + fmt(clipB) + ')');
                }
            } else { audio.currentTime = t; }
        });
        bar.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowRight') { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5); e.preventDefault(); }
            else if (e.key === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime - 5); e.preventDefault(); }
            else if (e.key === ' ' || e.key === 'Enter') { audio.paused ? audio.play() : audio.pause(); e.preventDefault(); }
        });
        // Speed: tap cycles; long-press (or right-click) opens a picker.
        var spdMenu = null, spdTimer = null, spdLong = false;
        function setSpeed(rate) {
            si = speeds.indexOf(rate); if (si < 0) { speeds.push(rate); si = speeds.length - 1; }
            audio.playbackRate = rate; spd.textContent = rate + '×';
        }
        function closeSpeedMenu() {
            if (!spdMenu) return;
            spdMenu.remove(); spdMenu = null;
            document.removeEventListener('click', closeSpeedMenu);
        }
        function openSpeedMenu() {
            closeSpeedMenu();
            spdMenu = document.createElement('div'); spdMenu.className = 'ep-spd-menu';
            speeds.slice().sort(function (a, b) { return a - b; }).forEach(function (r) {
                var b = document.createElement('button');
                b.type = 'button'; b.className = 'ep-spd-opt' + (r === speeds[si] ? ' ep-on' : '');
                b.textContent = r + '×';
                b.addEventListener('click', function (ev) { ev.stopPropagation(); setSpeed(r); closeSpeedMenu(); });
                spdMenu.appendChild(b);
            });
            spd.parentNode.appendChild(spdMenu);
            setTimeout(function () { document.addEventListener('click', closeSpeedMenu); }, 0);
        }
        spd.addEventListener('pointerdown', function () { spdLong = false; spdTimer = setTimeout(function () { spdLong = true; openSpeedMenu(); }, 450); });
        spd.addEventListener('pointerup', function () { clearTimeout(spdTimer); });
        spd.addEventListener('pointerleave', function () { clearTimeout(spdTimer); });
        spd.addEventListener('contextmenu', function (e) { e.preventDefault(); openSpeedMenu(); });
        spd.addEventListener('click', function (e) {
            if (spdLong) { e.preventDefault(); e.stopPropagation(); spdLong = false; return; }
            si = (si + 1) % speeds.length; audio.playbackRate = speeds[si]; spd.textContent = speeds[si] + '×';
        });
        Q('.ep-share').addEventListener('click', function () { copy(urlAt(audio.currentTime, null)); toast('Link copied at ' + fmt(audio.currentTime)); });
        Q('.ep-clip').addEventListener('click', function () {
            clipMode = !clipMode; clipA = null; this.classList.toggle('ep-on', clipMode);
            if (clipMode) toast('Click start, then end, on the bar');
        });
        el.querySelectorAll('.ep-chap').forEach(function (c) {
            c.addEventListener('click', function () { load(+c.dataset.i, 0, true); });
        });

        // OS / lock-screen / headphone controls.
        if ('mediaSession' in navigator) {
            var ms = navigator.mediaSession, H = function (a, fn) { try { ms.setActionHandler(a, fn); } catch (e) { /* unsupported */ } };
            H('play', function () { audio.play(); });
            H('pause', function () { audio.pause(); });
            H('seekbackward', function (e) { audio.currentTime = Math.max(0, audio.currentTime - ((e && e.seekOffset) || 15)); });
            H('seekforward', function (e) { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + ((e && e.seekOffset) || 15)); });
            H('seekto', function (e) { if (e.fastSeek && 'fastSeek' in audio) { audio.fastSeek(e.seekTime); return; } audio.currentTime = e.seekTime; });
            H('previoustrack', function () { if (cur > 0) load(cur - 1, 0, true); });
            H('nexttrack', function () { if (cur < all.length - 1) load(cur + 1, 0, true); });
        }

        load(startCh, (startT || clipEnd != null) ? startT : null, applyUrl && !!(qp.get('t') || clipEnd));
    }

    function boot() {
        var players = document.querySelectorAll('.episode-player');
        // Deep-link params (?t/&ch/&end) target the first player on the page.
        players.forEach(function (el, idx) { init(el, idx === 0); });
    }
    if (document.readyState !== 'loading') boot();
    else document.addEventListener('DOMContentLoaded', boot);
})();
