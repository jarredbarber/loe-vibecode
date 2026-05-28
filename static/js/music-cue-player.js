// Custom inline player for .mcp blocks emitted by speaker_highlight.
// Native <audio controls> looks foreign in transcripts — this is a small
// branded play button + progress bar that uses the underlying <audio> element.

(function () {
    'use strict';

    function fmt(sec) {
        if (!isFinite(sec) || sec < 0) return '0:00';
        var m = Math.floor(sec / 60);
        var s = Math.floor(sec % 60);
        return m + ':' + (s < 10 ? '0' + s : s);
    }

    // Only one cue plays at a time. Pause others when one starts.
    var currentPlayer = null;

    function wire(player) {
        var audio = player.querySelector('.mcp-audio');
        var btn = player.querySelector('.mcp-play');
        var progress = player.querySelector('.mcp-progress');
        var fill = player.querySelector('.mcp-fill');
        var time = player.querySelector('.mcp-time');
        if (!audio || !btn || !progress || !fill || !time) return;

        function setIcon(playing) {
            btn.textContent = playing ? '❚❚' : '▶';
            btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
            player.classList.toggle('mcp-playing', playing);
        }

        btn.addEventListener('click', function () {
            if (audio.paused) {
                if (currentPlayer && currentPlayer !== audio) currentPlayer.pause();
                audio.play();
                currentPlayer = audio;
            } else {
                audio.pause();
            }
        });

        audio.addEventListener('play', function () { setIcon(true); });
        audio.addEventListener('pause', function () { setIcon(false); });
        audio.addEventListener('ended', function () { setIcon(false); fill.style.width = '0%'; time.textContent = fmt(audio.duration || 0); });

        audio.addEventListener('timeupdate', function () {
            var d = audio.duration;
            if (d && isFinite(d)) {
                fill.style.width = (audio.currentTime / d * 100) + '%';
                time.textContent = fmt(audio.currentTime) + ' / ' + fmt(d);
            } else {
                time.textContent = fmt(audio.currentTime);
            }
        });

        audio.addEventListener('loadedmetadata', function () {
            time.textContent = fmt(audio.duration || 0);
        });

        progress.addEventListener('click', function (e) {
            var d = audio.duration;
            if (!d || !isFinite(d)) return;
            var rect = progress.getBoundingClientRect();
            var pct = (e.clientX - rect.left) / rect.width;
            audio.currentTime = Math.max(0, Math.min(d, pct * d));
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        var players = document.querySelectorAll('.mcp');
        for (var i = 0; i < players.length; i++) wire(players[i]);
    }
})();
