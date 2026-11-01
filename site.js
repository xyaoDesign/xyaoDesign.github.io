/* Small behaviour layer for the portfolio: filters, rotating words,
   image lightbox and before/after comparison sliders. */
(function () {
  'use strict';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Landing page: rotating hero words ---------- */
  var words = Array.prototype.slice.call(document.querySelectorAll('.rot'));
  if (words.length > 1) {
    var w = 0;
    setInterval(function () {
      w = (w + 1) % words.length;
      words.forEach(function (el, i) {
        var on = i === w;
        el.style.opacity = on ? '1' : '0';
        el.style.transform = on ? 'translateY(0)' : 'translateY(-8px)';
        el.setAttribute('aria-hidden', on ? 'false' : 'true');
      });
    }, 2200);
  }

  /* ---------- Landing page: project filters ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-filter]');
    if (!btn) return;
    var name = btn.getAttribute('data-filter');
    var tpl = null;
    document.querySelectorAll('template[data-view]').forEach(function (t) {
      if (t.getAttribute('data-view') === name) tpl = t;
    });
    var current = btn.closest('section');
    if (!tpl || !current) return;
    // keep the outgoing view as a template so we can switch back
    var pressed = current.querySelector('[data-filter][aria-pressed="true"]');
    if (pressed) {
      var back = document.createElement('template');
      back.setAttribute('data-view', pressed.getAttribute('data-filter'));
      back.innerHTML = current.outerHTML;
      document.body.appendChild(back);
    }
    var holder = document.createElement('div');
    holder.innerHTML = tpl.innerHTML;
    var next = holder.firstElementChild;
    current.replaceWith(next);
    tpl.remove();
    var again = next.querySelector('[data-filter="' + name.replace(/"/g, '\\"') + '"]');
    if (again) again.focus();
  });

  /* ---------- Lightbox ---------- */
  var dataEl = document.getElementById('lb-data');
  var dlg = document.querySelector('[data-lb-dialog]');
  if (dataEl && dlg) {
    var data = JSON.parse(dataEl.textContent);
    var group = null, index = 0, zoom = false, lastFocus = null;

    var current = function () {
      var o = Object.assign({}, data.groups[group][index]);
      if (zoom && data.zoomDiff) Object.assign(o, data.zoomDiff);
      return o;
    };
    var fill = function (tmpl, lb) {
      return tmpl.replace(/\{\{lb\.(\w+)\}\}/g, function (m, k) { return lb[k] == null ? '' : String(lb[k]); });
    };
    var paint = function () {
      var lb = current();
      var els = [dlg].concat(Array.prototype.slice.call(dlg.querySelectorAll('*')));
      els.forEach(function (el) {
        Array.prototype.slice.call(el.attributes).forEach(function (at) {
          if (at.name === 'data-lbt-text') el.textContent = fill(at.value, lb);
          else if (at.name.indexOf('data-lbt-') === 0) el.setAttribute(at.name.slice(9), fill(at.value, lb));
        });
        var cond = el.getAttribute('data-lb-if');
        if (cond) el.hidden = !lb[cond];
      });
    };
    var open = function (g, i) {
      if (!data.groups[g] || !data.groups[g][i]) return;
      lastFocus = document.activeElement;
      group = g; index = i; zoom = false;
      paint();
      dlg.hidden = false;
      document.documentElement.style.overflow = 'hidden';
      dlg.focus();
    };
    var close = function () {
      dlg.hidden = true;
      group = null;
      document.documentElement.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };
    var step = function (d) {
      var list = data.groups[group] || [];
      if (list.length < 2) return;
      index = (index + d + list.length) % list.length;
      zoom = false;
      paint();
    };

    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-lb-open]');
      if (t) {
        var s = JSON.parse(t.getAttribute('data-lb-open'));
        open(s.g, s.i);
      }
    });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) { close(); return; }
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'close') close();
      else if (act === 'prev') step(-1);
      else if (act === 'next') step(1);
      else if (act === 'zoom') { zoom = !zoom; paint(); }
    });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'Tab') {
        // keep focus inside the dialog
        var f = Array.prototype.filter.call(dlg.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])'), function (x) { return !x.closest('[hidden]'); });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dlg)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---------- Before / after comparison ---------- */
  document.querySelectorAll('[data-compare]').forEach(function (box) {
    var clip = box.querySelector('[data-cmp-clip]');
    var lefts = box.querySelectorAll('[data-cmp-left]');
    var handle = box.querySelector('[role="slider"]');
    var pos = 50, dragging = false;
    var set = function (p) {
      pos = Math.max(0, Math.min(100, p));
      if (clip) clip.style.clipPath = 'inset(0 ' + (100 - pos) + '% 0 0)';
      lefts.forEach(function (l) { l.style.left = pos + '%'; });
      if (handle) {
        handle.setAttribute('aria-valuenow', String(Math.round(pos)));
        handle.setAttribute('aria-valuetext', 'Showing ' + Math.round(pos) + '% after');
      }
    };
    var fromEvent = function (e) {
      var r = box.getBoundingClientRect();
      if (r.width > 0) set(((e.clientX - r.left) / r.width) * 100);
    };
    box.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      try { box.setPointerCapture(e.pointerId); } catch (_) {}
      fromEvent(e);
    });
    box.addEventListener('pointermove', function (e) { if (dragging) fromEvent(e); });
    var stop = function () { dragging = false; };
    box.addEventListener('pointerup', stop);
    box.addEventListener('pointercancel', stop);
    if (handle) handle.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); set(pos - 5); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); set(pos + 5); }
      else if (e.key === 'Home') { e.preventDefault(); set(0); }
      else if (e.key === 'End') { e.preventDefault(); set(100); }
    });
  });

  /* ---------- Muted looping clips: respect reduced motion ---------- */
  if (reduceMotion) {
    document.querySelectorAll('video[autoplay]').forEach(function (v) { v.removeAttribute('autoplay'); try { v.pause(); } catch (_) {} });
  }
})();
