// Wires the build-time .episode-player markup (see modules/audio-player.njk).
// Reads track ids from .ep-chap nodes and plays the enclosure mp3
// (traffic.megaphone.fm/<id>.mp3 — preserves Megaphone ads + download counts).
// Features: play/pause, scrub, buffered, speed, resume (localStorage),
// chapter list with auto-advance, ?t=/&ch=/&end= deep-links, clip-to-share.

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
        var tracks = [].slice.call(el.querySelectorAll('.ep-chap')).map(function (li) {
            return { id: li.dataset.id, title: (li.querySelector('.ep-chap-t') || {}).textContent || '' };
        });
        if (!tracks.length) return;
        var multi = !el.classList.contains('episode-player--single') && tracks.length > 1;

        var Q = function (s) { return el.querySelector(s); };
        var audio = new Audio(); audio.preload = 'metadata';
        var play = Q('.ep-play'), bar = Q('.ep-bar'), fill = Q('.ep-fill'), buf = Q('.ep-buf'),
            curEl = Q('.ep-cur'), durEl = Q('.ep-dur'), now = Q('.ep-now'), spd = Q('.ep-spd');
        var speeds = [1, 1.5, 2], si = 0, cur = -1, pend = null, tick = 0;
        var clipMode = false, clipA = null, clipB = null, stopAt = null;

        var qp = new URLSearchParams(applyUrl ? location.search : '');
        var startCh = Math.max(0, Math.min(tracks.length - 1, parseInt(qp.get('ch') || '0', 10) || 0));
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
            if (multi) u.searchParams.set('ch', cur);
            return u.toString();
        }
        function setChap(i) {
            el.querySelectorAll('.ep-chap').forEach(function (c) { c.classList.toggle('ep-cur', +c.dataset.i === i); });
        }
        function load(i, seek, auto) {
            cur = i;
            pend = (seek != null) ? seek : (parseFloat(localStorage.getItem('ep-pos-' + tracks[i].id)) || 0);
            audio.src = mp3(tracks[i].id); audio.load();
            now.textContent = tracks[i].title;
            durEl.textContent = '--:--'; curEl.textContent = '0:00';
            fill.style.right = '100%'; buf.style.right = '100%';
            setChap(i);
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
            if (++tick % 10 === 0) localStorage.setItem('ep-pos-' + tracks[cur].id, audio.currentTime);
            if (stopAt != null && audio.currentTime >= stopAt) { audio.pause(); stopAt = null; }
        });
        audio.addEventListener('play', function () { play.textContent = '❚❚'; play.setAttribute('aria-label', 'Pause'); });
        audio.addEventListener('pause', function () {
            play.textContent = '▶'; play.setAttribute('aria-label', 'Play');
            if (cur >= 0) localStorage.setItem('ep-pos-' + tracks[cur].id, audio.currentTime);
        });
        audio.addEventListener('ended', function () {
            localStorage.removeItem('ep-pos-' + tracks[cur].id);
            if (multi && cur < tracks.length - 1) load(cur + 1, 0, true);
        });

        play.addEventListener('click', function () { audio.paused ? audio.play() : audio.pause(); });
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
        spd.addEventListener('click', function () { si = (si + 1) % speeds.length; audio.playbackRate = speeds[si]; spd.textContent = speeds[si] + '×'; });
        Q('.ep-share').addEventListener('click', function () { copy(urlAt(audio.currentTime, null)); toast('Link copied at ' + fmt(audio.currentTime)); });
        Q('.ep-clip').addEventListener('click', function () {
            clipMode = !clipMode; clipA = null; this.classList.toggle('ep-on', clipMode);
            if (clipMode) toast('Click start, then end, on the bar');
        });
        el.querySelectorAll('.ep-chap').forEach(function (c) {
            c.addEventListener('click', function () { load(+c.dataset.i, 0, true); });
        });

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
