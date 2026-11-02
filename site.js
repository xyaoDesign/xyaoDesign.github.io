/* Small behaviour layer for the portfolio: filters, rotating words,
   image lightbox and before/after comparison sliders. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Landing page: rotating hero words ---------- */
  var words = Array.prototype.slice.call(
    document.querySelectorAll('.rot')
  );

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

  /* ---------- Touch thumbnails: one active card nearest 40% from the top ---------- */
  var touchCards = window.matchMedia(
    '(hover: none) and (pointer: coarse)'
  );
  var cards = [];
  var cardFrame = null;

  var updateCards = function () {
    cardFrame = null;

    var viewport = window.visualViewport;
    var top = viewport ? viewport.offsetTop : 0;
    var height = viewport ? viewport.height : window.innerHeight;

    // Use the middle of the requested 30–50% focus range.
    var line = top + height * 0.4;
    var nearest = null;
    var nearestDistance = Infinity;

    // Read all positions before changing styles to avoid repeated layout work.
    if (touchCards.matches) {
      cards.forEach(function (card) {
        var rect = card.getBoundingClientRect();

        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.bottom <= top ||
          rect.top >= top + height
        ) {
          return;
        }

        var distance = Math.abs(
          rect.top + rect.height / 2 - line
        );

        if (distance < nearestDistance) {
          nearest = card;
          nearestDistance = distance;
        }
      });
    }

    cards.forEach(function (card) {
      card.classList.toggle('is-scroll-active', card === nearest);
    });
  };

  var scheduleCards = function () {
    if (cardFrame === null) {
      cardFrame = window.requestAnimationFrame(updateCards);
    }
  };

  var refreshCards = function () {
    cards = Array.prototype.slice.call(
      document.querySelectorAll('.card')
    );
    scheduleCards();
  };

  refreshCards();

  if (cards.length) {
    window.addEventListener('scroll', scheduleCards, { passive: true });
    window.addEventListener('resize', scheduleCards);
    touchCards.addEventListener('change', scheduleCards);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleCards);
      window.visualViewport.addEventListener(
        'scroll',
        scheduleCards,
        { passive: true }
      );
    }
  }

  /* ---------- Landing page: project filters ---------- */
  // The chosen filter is remembered for this browser tab, so coming back
  // from a project page (logo, "Work", or the back button) keeps it.
  var FILTER_KEY = 'portfolio-filter';
  var saveFilter = function (name) {
    try { sessionStorage.setItem(FILTER_KEY, name); } catch (_) {}
  };
  var savedFilter = function () {
    try { return sessionStorage.getItem(FILTER_KEY); } catch (_) { return null; }
  };

  var applyFilter = function (name, moveFocus) {
    var tpl = null;

    document.querySelectorAll('template[data-view]').forEach(function (t) {
      if (t.getAttribute('data-view') === name) tpl = t;
    });

    var currentBtn = document.querySelector('[data-filter][aria-pressed="true"]');
    var current = currentBtn && currentBtn.closest('section');
    if (!tpl || !current) return;

    // Keep the outgoing view as a template so we can switch back.
    var pressed = current.querySelector(
      '[data-filter][aria-pressed="true"]'
    );

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

    var again = next.querySelector(
      '[data-filter="' + name.replace(/"/g, '\\"') + '"]'
    );

    if (again && moveFocus) again.focus();

    refreshCards();
  };

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-filter]');
    if (!btn) return;

    var name = btn.getAttribute('data-filter');
    saveFilter(name);
    applyFilter(name, true);
  });

  // Restore the filter chosen earlier in this tab.
  var restoreFilter = function () {
    var name = savedFilter();
    var pressed = document.querySelector('[data-filter][aria-pressed="true"]');
    if (name && pressed && pressed.getAttribute('data-filter') !== name) {
      applyFilter(name, false);
    }
  };
  restoreFilter();

  /* ---------- Lightbox ---------- */
  var dataEl = document.getElementById('lb-data');
  var dlg = document.querySelector('[data-lb-dialog]');

  if (dataEl && dlg) {
    var data = JSON.parse(dataEl.textContent);
    var group = null;
    var index = 0;
    var zoom = false;
    var lastFocus = null;

    var current = function () {
      var o = Object.assign({}, data.groups[group][index]);
      if (zoom && data.zoomDiff) Object.assign(o, data.zoomDiff);
      return o;
    };

    var fill = function (tmpl, lb) {
      return tmpl.replace(/\{\{lb\.(\w+)\}\}/g, function (m, k) {
        return lb[k] == null ? '' : String(lb[k]);
      });
    };

    var paint = function () {
      var lb = current();

      var els = [dlg].concat(
        Array.prototype.slice.call(dlg.querySelectorAll('*'))
      );

      els.forEach(function (el) {
        Array.prototype.slice.call(el.attributes).forEach(function (at) {
          if (at.name === 'data-lbt-text') {
            el.textContent = fill(at.value, lb);
          } else if (at.name.indexOf('data-lbt-') === 0) {
            el.setAttribute(at.name.slice(9), fill(at.value, lb));
          }
        });

        var cond = el.getAttribute('data-lb-if');
        if (cond) el.hidden = !lb[cond];
      });

      resetPinch();
    };

    /* ---------- Touch screens: pinch to zoom, drag to pan ---------- */
    var touchMode = window.matchMedia &&
      window.matchMedia('(hover: none) and (pointer: coarse)');
    var lbImg = dlg.querySelector('img[data-lbt-src]');
    var pinch = { scale: 1, x: 0, y: 0 };
    var gesture = null;
    var lastTap = 0;

    var applyPinch = function (animate) {
      if (!lbImg) return;
      lbImg.style.transition = animate ? 'transform 200ms ease' : 'none';
      lbImg.style.transform = pinch.scale === 1
        ? ''
        : 'translate(' + pinch.x + 'px, ' + pinch.y + 'px) scale(' + pinch.scale + ')';
    };

    var clampPan = function () {
      if (!lbImg) return;
      var maxX = (lbImg.offsetWidth * (pinch.scale - 1)) / 2;
      var maxY = (lbImg.offsetHeight * (pinch.scale - 1)) / 2;
      pinch.x = Math.max(-maxX, Math.min(maxX, pinch.x));
      pinch.y = Math.max(-maxY, Math.min(maxY, pinch.y));
    };

    function resetPinch() {
      pinch = { scale: 1, x: 0, y: 0 };
      gesture = null;
      applyPinch(false);
    }

    var dist = function (a, b) {
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };
    var mid = function (a, b) {
      return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    };

    if (lbImg) {
      var area = lbImg.parentElement;

      area.addEventListener('touchstart', function (e) {
        if (!touchMode || !touchMode.matches) return;
        var t = e.touches;

        if (t.length === 2) {
          var m = mid(t[0], t[1]);
          gesture = {
            type: 'pinch',
            d: dist(t[0], t[1]),
            scale: pinch.scale,
            mx: m.x, my: m.y, x: pinch.x, y: pinch.y
          };
        } else if (t.length === 1) {
          var now = Date.now();
          if (now - lastTap < 300) {
            // Double tap: toggle between fit and 2.5x.
            e.preventDefault();
            pinch.scale = pinch.scale > 1 ? 1 : 2.5;
            pinch.x = 0;
            pinch.y = 0;
            applyPinch(true);
            lastTap = 0;
            gesture = null;
            return;
          }
          lastTap = now;
          if (pinch.scale > 1) {
            gesture = {
              type: 'pan',
              sx: t[0].clientX, sy: t[0].clientY, x: pinch.x, y: pinch.y
            };
          }
        }
      }, { passive: false });

      area.addEventListener('touchmove', function (e) {
        if (!gesture) return;
        var t = e.touches;
        e.preventDefault();

        if (gesture.type === 'pinch' && t.length === 2) {
          var m = mid(t[0], t[1]);
          pinch.scale = Math.max(1, Math.min(5, gesture.scale * dist(t[0], t[1]) / gesture.d));
          pinch.x = gesture.x + (m.x - gesture.mx);
          pinch.y = gesture.y + (m.y - gesture.my);
        } else if (gesture.type === 'pan' && t.length === 1) {
          pinch.x = gesture.x + (t[0].clientX - gesture.sx);
          pinch.y = gesture.y + (t[0].clientY - gesture.sy);
        }

        clampPan();
        applyPinch(false);
      }, { passive: false });

      area.addEventListener('touchend', function (e) {
        if (!gesture) return;
        if (e.touches.length === 0) {
          if (pinch.scale < 1.05) resetPinch();
          gesture = null;
        } else if (e.touches.length === 1 && pinch.scale > 1) {
          // One finger lifted after a pinch: keep panning with the other.
          gesture = {
            type: 'pan',
            sx: e.touches[0].clientX, sy: e.touches[0].clientY,
            x: pinch.x, y: pinch.y
          };
        }
      });

      // Stop Safari's own page zoom while the lightbox is open.
      dlg.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    }

    var open = function (g, i) {
      if (!data.groups[g] || !data.groups[g][i]) return;

      lastFocus = document.activeElement;
      group = g;
      index = i;
      zoom = false;

      paint();

      dlg.hidden = false;
      document.documentElement.style.overflow = 'hidden';
      dlg.focus();
    };

    var close = function () {
      resetPinch();
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
      if (e.target === dlg) {
        close();
        return;
      }

      var b = e.target.closest('[data-act]');
      if (!b) return;

      var act = b.getAttribute('data-act');

      if (act === 'close') {
        close();
      } else if (act === 'prev') {
        step(-1);
      } else if (act === 'next') {
        step(1);
      } else if (act === 'zoom') {
        zoom = !zoom;
        paint();
      }
    });

    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'Tab') {
        // Keep focus inside the dialog.
        var f = Array.prototype.filter.call(
          dlg.querySelectorAll(
            'button, [href], [tabindex]:not([tabindex="-1"])'
          ),
          function (x) {
            return !x.closest('[hidden]');
          }
        );

        if (!f.length) return;

        var first = f[0];
        var last = f[f.length - 1];

        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === dlg)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  /* ---------- Before / after comparison ---------- */
  document.querySelectorAll('[data-compare]').forEach(function (box) {
    var clip = box.querySelector('[data-cmp-clip]');
    var lefts = box.querySelectorAll('[data-cmp-left]');
    var handle = box.querySelector('[role="slider"]');
    var pos = 50;
    var dragging = false;

    var set = function (p) {
      pos = Math.max(0, Math.min(100, p));

      if (clip) {
        clip.style.clipPath = 'inset(0 ' + (100 - pos) + '% 0 0)';
      }

      lefts.forEach(function (l) {
        l.style.left = pos + '%';
      });

      if (handle) {
        handle.setAttribute('aria-valuenow', String(Math.round(pos)));
        handle.setAttribute(
          'aria-valuetext',
          'Showing ' + Math.round(pos) + '% after'
        );
      }
    };

    var fromEvent = function (e) {
      var r = box.getBoundingClientRect();

      if (r.width > 0) {
        set(((e.clientX - r.left) / r.width) * 100);
      }
    };

    box.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;

      dragging = true;

      try {
        box.setPointerCapture(e.pointerId);
      } catch (_) {}

      fromEvent(e);
    });

    box.addEventListener('pointermove', function (e) {
      if (dragging) fromEvent(e);
    });

    var stop = function () {
      dragging = false;
    };

    box.addEventListener('pointerup', stop);
    box.addEventListener('pointercancel', stop);

    if (handle) {
      handle.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          set(pos - 5);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          set(pos + 5);
        } else if (e.key === 'Home') {
          e.preventDefault();
          set(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          set(100);
        }
      });
    }
  });

  /* ---------- Muted looping clips: respect reduced motion ---------- */
  if (reduceMotion) {
    document.querySelectorAll('video[autoplay]').forEach(function (v) {
      v.removeAttribute('autoplay');

      try {
        v.pause();
      } catch (_) {}
    });
  }
})();