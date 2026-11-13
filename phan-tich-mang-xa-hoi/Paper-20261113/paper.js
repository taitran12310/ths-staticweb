    (function () {
      "use strict";
      var root = document.documentElement;
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var hasIO = "IntersectionObserver" in window;

      /* ---------- Giao diện sáng / tối ---------- */
      var toggle = document.querySelector(".theme-toggle");
      function currentTheme() {
        var t = root.getAttribute("data-theme");
        if (t === "light" || t === "dark") return t;
        return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      function paintToggle() {
        var dark = currentTheme() === "dark";
        toggle.firstElementChild.textContent = dark ? "☀" : "☾";
        toggle.setAttribute("aria-label", dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối");
      }
      toggle.addEventListener("click", function () {
        var next = currentTheme() === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try { localStorage.setItem("ptmxh-paper-theme", next); } catch (e) {}
        paintToggle();
      });
      if (window.matchMedia) {
        var mq = window.matchMedia("(prefers-color-scheme: dark)");
        if (mq.addEventListener) mq.addEventListener("change", paintToggle);
      }
      paintToggle();

      /* ---------- Thanh tiến độ và nút lên đầu ---------- */
      var bar = document.querySelector(".progress");
      var topBtn = document.querySelector(".to-top");
      var ticking = false;
      function onScroll() {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
          var max = document.documentElement.scrollHeight - window.innerHeight;
          var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
          bar.style.transform = "scaleX(" + p + ")";
          topBtn.classList.toggle("show", window.scrollY > 600);
          ticking = false;
        });
      }
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      onScroll();
      topBtn.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        var skip = document.querySelector(".skip");
        if (skip) skip.focus({ preventScroll: true });
      });

      var sections = Array.prototype.slice.call(document.querySelectorAll("main section[id]"));

      /* ---------- Mục lục: đánh dấu mục đang đọc ---------- */
      var links = {};
      Array.prototype.forEach.call(document.querySelectorAll(".toc a[href^='#']"), function (a) {
        links[a.getAttribute("href").slice(1)] = a;
      });
      function setActive(id) {
        Object.keys(links).forEach(function (k) {
          if (k === id) links[k].setAttribute("aria-current", "true");
          else links[k].removeAttribute("aria-current");
        });
      }
      if (hasIO) {
        var visible = {};
        var tocIO = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
          for (var i = 0; i < sections.length; i++) {
            if (visible[sections[i].id]) { setActive(sections[i].id); break; }
          }
        }, { rootMargin: "-20% 0px -70% 0px" });
        sections.forEach(function (s) { tocIO.observe(s); });
      }

      /* ---------- Hiện dần từng mục ---------- */
      if (hasIO && !reduce) {
        var revealIO = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) { e.target.classList.add("in"); revealIO.unobserve(e.target); }
          });
        }, { rootMargin: "0px 0px -8% 0px", threshold: 0.02 });
        sections.forEach(function (s) {
          var r = s.getBoundingClientRect();
          if (r.top < window.innerHeight) return;
          s.classList.add("reveal");
          revealIO.observe(s);
        });
      }

      /* ---------- Đếm số ---------- */
      function fmt(v, dec) {
        var s = v.toFixed(dec).split(".");
        s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
        return s.join(".");
      }
      var nums = Array.prototype.slice.call(document.querySelectorAll(".stat-num[data-to]"));
      function countUp(el) {
        var to = parseFloat(el.getAttribute("data-to"));
        var dec = parseInt(el.getAttribute("data-dec"), 10) || 0;
        var start = null, dur = 1100;
        function step(ts) {
          if (start === null) start = ts;
          var k = Math.min(1, (ts - start) / dur);
          var e = 1 - Math.pow(1 - k, 3);
          el.textContent = fmt(to * e, dec);
          if (k < 1) window.requestAnimationFrame(step);
          else el.textContent = fmt(to, dec);
        }
        window.requestAnimationFrame(step);
      }
      if (hasIO && !reduce) {
        var numIO = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) { countUp(e.target); numIO.unobserve(e.target); }
          });
        }, { threshold: 0.6 });
        nums.forEach(function (n) { numIO.observe(n); });
      }
    })();
