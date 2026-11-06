(() => {
  const { fmt, setLoading, showError, queryParam, setupThemeToggle, loadJson } = window.SNA;
  const IMG = "https://image.tmdb.org/t/p/w500";
  const IMG_HERO = "https://image.tmdb.org/t/p/w1280";
  const IMG_FACE = "https://image.tmdb.org/t/p/w185";
  const IMG_PROFILE = "https://image.tmdb.org/t/p/h632";

  let catalog = null;
  let posters = {};
  let actorPhotos = {};
  let actorById = new Map();
  let movieList = [];
  let titles = {};
  let titleLang = "vi";
  let openMovieId = null;
  let heroMovie = null;
  let heroSlides = [];
  let heroIndex = 0;
  let modalMode = "movie"; // movie | actor

  const TONES = [
    ["#5c2a2a", "#1a1218"],
    ["#2a3d5c", "#10141c"],
    ["#3d4a2a", "#121610"],
    ["#4a2a5c", "#140f18"],
    ["#2a4a45", "#0e1614"],
    ["#5c3d2a", "#18120e"],
  ];

  function toneFor(id) {
    const n = Math.abs(Number(id) || String(id).length * 17) % TONES.length;
    return TONES[n];
  }

  function posterUrl(mid, size = "card") {
    const path = posters[String(mid)];
    if (!path) return null;
    return `${size === "hero" ? IMG_HERO : IMG}${path}`;
  }

  function actorPhotoUrl(pid, size = "face") {
    const path = actorPhotos[String(pid)];
    if (!path) return null;
    return `${size === "profile" ? IMG_PROFILE : IMG_FACE}${path}`;
  }

  function setPanelPhoto(el, url, fallbackId, kind = "movie") {
    if (!el) return;
    const img = document.getElementById("detailPosterImg");
    const blur = document.getElementById("detailPosterBlur");
    const fallback = document.getElementById("detailPosterFallback");
    const inner = el.closest(".cine-modal-inner");

    el.dataset.kind = kind;
    el.classList.toggle("is-actor", kind === "actor");
    el.classList.toggle("is-movie", kind !== "actor");
    if (inner) {
      inner.classList.toggle("is-actor", kind === "actor");
      inner.classList.toggle("is-movie", kind !== "actor");
    }

    el.style.backgroundImage = "";
    if (url && img) {
      img.hidden = false;
      img.removeAttribute("hidden");
      img.src = url;
      img.alt = "";
      if (fallback) fallback.hidden = true;
      if (blur) {
        blur.style.backgroundImage = `url("${url}")`;
        blur.hidden = false;
      }
      el.classList.add("has-photo");
      img.onerror = () => {
        img.hidden = true;
        if (blur) blur.hidden = true;
        showPanelFallback(el, fallback, fallbackId);
      };
      return;
    }
    if (img) {
      img.hidden = true;
      img.removeAttribute("src");
    }
    if (blur) blur.hidden = true;
    showPanelFallback(el, fallback, fallbackId);
  }

  function showPanelFallback(el, fallback, fallbackId) {
    el.classList.remove("has-photo");
    if (!fallback) return;
    const [a, b] = toneFor(fallbackId);
    fallback.hidden = false;
    fallback.style.background = `linear-gradient(160deg, ${a}, ${b})`;
  }

  function avatarEl(pid, name) {
    const wrap = document.createElement("span");
    wrap.className = "cine-avatar";
    wrap.dataset.pid = String(pid);
    wrap.dataset.name = name || "";
    paintAvatar(wrap);
    return wrap;
  }

  function paintAvatar(wrap) {
    const pid = wrap.dataset.pid;
    const name = wrap.dataset.name || "";
    const url = actorPhotoUrl(pid, "face");
    if (wrap.querySelector("img")) return;
    if (!url) {
      if (wrap.classList.contains("is-fallback")) return;
      wrap.textContent = (name || "?").slice(0, 1).toUpperCase();
      wrap.classList.add("is-fallback");
      const [tone] = toneFor(pid);
      wrap.style.background = tone;
      return;
    }
    wrap.textContent = "";
    wrap.classList.remove("is-fallback");
    wrap.style.background = "";
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
      img.remove();
      wrap.textContent = (name || "?").slice(0, 1).toUpperCase();
      wrap.classList.add("is-fallback");
      const [a] = toneFor(pid);
      wrap.style.background = a;
    });
    wrap.appendChild(img);
  }

  function refreshAvatars() {
    document.querySelectorAll(".cine-avatar[data-pid]").forEach(paintAvatar);
  }

  function scoreMovie(m) {
    return (Number(m.popularity) || 0) + (Number(m.vote_average) || 0) * 3 + (Number(m.vote_count) || 0) / 500;
  }

  function originCode(movie) {
    const code = String(movie?.origin_lang || "").toLowerCase();
    if (code === "vi") return "vn";
    if (code === "ko") return "kr";
    return code;
  }

  function langLabel(lang) {
    const code = lang === "vi" ? "vn" : lang === "ko" ? "kr" : lang;
    if (code === "us") return "Mỹ";
    if (code === "gb") return "Anh";
    if (code === "vn") return "Việt Nam";
    if (code === "kr") return "Hàn Quốc";
    return "";
  }

  function movieTitle(movie) {
    if (!movie) return "";
    const pack = titles[String(movie.id)] || {};
    return pack[titleLang] || pack.en || movie.title || pack.vi || pack.ko || "";
  }

  function movieTitleBlob(movie) {
    const pack = titles[String(movie.id)] || {};
    return [movie.title, pack.vi, pack.en, pack.ko].filter(Boolean).join(" ").toLowerCase();
  }

  function movieMetaLine(m) {
    const parts = [
      fmt.year(m.release_date),
      m.runtime ? `${m.runtime} phút` : null,
      m.vote_average != null ? `★ ${fmt.float(m.vote_average, 1)}` : null,
      langLabel(m.origin_lang),
    ];
    return parts.filter(Boolean).join(" · ");
  }

  function createPosterEl(movie, { large = false } = {}) {
    const wrap = document.createElement("div");
    wrap.className = "cine-poster";
    const url = posterUrl(movie.id, large ? "hero" : "card");
    const vote = movie.vote_average != null ? fmt.float(movie.vote_average, 1) : null;
    if (vote) {
      const badge = document.createElement("span");
      badge.className = "cine-badge";
      badge.textContent = `★ ${vote}`;
      wrap.appendChild(badge);
    }
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", () => {
        img.remove();
        wrap.appendChild(fallbackPoster(movie));
      });
      wrap.appendChild(img);
    } else {
      wrap.appendChild(fallbackPoster(movie));
    }
    return wrap;
  }

  function fallbackPoster(movie) {
    const [a, b] = toneFor(movie.id);
    const el = document.createElement("div");
    el.className = "cine-poster-fallback";
    el.style.setProperty("--tone-a", a);
    el.style.setProperty("--tone-b", b);
    const note = document.createElement("span");
    note.className = "fallback-note";
    const year = Number(String(movie.release_date || "").slice(0, 4));
    note.textContent = year > 2026 ? "Sắp chiếu" : "Chưa có poster";
    const strong = document.createElement("strong");
    strong.textContent = movieTitle(movie) || "?";
    el.appendChild(note);
    el.appendChild(strong);
    return el;
  }

  function movieCard(movie) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cine-card";
    btn.setAttribute("aria-label", movieTitle(movie));
    btn.appendChild(createPosterEl(movie));
    const title = document.createElement("p");
    title.className = "cine-card-title";
    title.textContent = movieTitle(movie);
    const sub = document.createElement("p");
    sub.className = "cine-card-sub";
    sub.textContent = `${fmt.year(movie.release_date)} · ${langLabel(movie.origin_lang)}`;
    btn.appendChild(title);
    btn.appendChild(sub);
    btn.addEventListener("click", () => openMovie(movie.id));
    return btn;
  }

  function renderRow(title, movies, note) {
    const section = document.createElement("section");
    section.className = "cine-row";
    const head = document.createElement("div");
    head.className = "cine-row-head";
    const h2 = document.createElement("h2");
    h2.textContent = title;
    head.appendChild(h2);
    if (note) {
      const span = document.createElement("span");
      span.textContent = note;
      head.appendChild(span);
    }
    const wrap = document.createElement("div");
    wrap.className = "cine-rail-wrap";
    const rail = document.createElement("div");
    rail.className = "cine-rail";
    rail.setAttribute("role", "list");
    movies.forEach((m) => {
      const card = movieCard(m);
      card.setAttribute("role", "listitem");
      rail.appendChild(card);
    });
    wrap.appendChild(rail);
    section.appendChild(head);
    section.appendChild(wrap);
    return section;
  }

  function renderGrid(title, movies, note) {
    const section = document.createElement("section");
    section.className = "cine-row cine-row-grid";
    const head = document.createElement("div");
    head.className = "cine-row-head";
    const h2 = document.createElement("h2");
    h2.textContent = title;
    head.appendChild(h2);
    if (note) {
      const span = document.createElement("span");
      span.textContent = note;
      head.appendChild(span);
    }
    const grid = document.createElement("div");
    grid.className = "cine-grid";
    grid.setAttribute("role", "list");
    movies.forEach((movie) => {
      const card = movieCard(movie);
      card.setAttribute("role", "listitem");
      grid.appendChild(card);
    });
    section.appendChild(head);
    section.appendChild(grid);
    return section;
  }

  function paintHeroLayer(el, movie) {
    const url = posterUrl(movie.id, "hero");
    const blur = el.querySelector(".cine-hero-blur");
    const img = el.querySelector(".cine-hero-poster");
    if (url) {
      if (blur) blur.style.backgroundImage = `url("${url}")`;
      if (img) {
        img.src = url;
        img.alt = "";
        img.hidden = false;
      }
      el.classList.add("has-image");
    } else {
      const [a, b] = toneFor(movie.id);
      if (blur) blur.style.backgroundImage = `linear-gradient(135deg, ${a}, ${b})`;
      if (img) {
        img.removeAttribute("src");
        img.hidden = true;
      }
      el.classList.remove("has-image");
    }
  }

  function setHero(movie, instant) {
    heroMovie = movie;
    const stage = document.getElementById("heroStage");
    const layers = [...stage.querySelectorAll(".cine-hero-bg")];
    if (instant || layers.length < 2) {
      paintHeroLayer(layers[0], movie);
      layers.forEach((el, i) => el.classList.toggle("is-front", i === 0));
    } else {
      const front = layers.find((el) => el.classList.contains("is-front")) || layers[0];
      const back = layers.find((el) => el !== front);
      paintHeroLayer(back, movie);
      back.classList.add("is-front");
      front.classList.remove("is-front");
    }
    const count = document.getElementById("heroCount");
    const position = heroSlides.length ? `${heroIndex + 1} / ${heroSlides.length}` : "";
    if (count) count.textContent = position;
    const slide = document.getElementById("heroSlide");
    if (slide) slide.setAttribute("aria-label", position ? `${position}: ${movieTitle(movie)}` : movieTitle(movie));
    document.getElementById("heroTitle").textContent = movieTitle(movie);
    document.getElementById("heroMeta").textContent = movieMetaLine(movie);
    document.getElementById("heroOverview").textContent =
      movie.overview || "Chưa có tóm tắt cho phim này.";
    const copy = document.querySelector(".cine-hero-copy");
    if (copy) {
      copy.classList.remove("is-enter");
      void copy.offsetWidth;
      copy.classList.add("is-enter");
    }
  }

  function pickHeroSlides() {
    const ranked = [...movieList].sort((a, b) => scoreMovie(b) - scoreMovie(a));
    const withArt = ranked.filter((movie) => posterUrl(movie.id, "hero"));
    const pool = withArt.length >= 10 ? withArt : ranked;
    return pool.slice(0, 10);
  }

  function renderHeroDots() {
    const box = document.getElementById("heroDots");
    if (!box) return;
    box.innerHTML = "";
    heroSlides.forEach((movie, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cine-hero-dot" + (index === heroIndex ? " is-active" : "");
      btn.dataset.index = String(index);
      btn.setAttribute("aria-label", `Phim ${index + 1}: ${movieTitle(movie)}`);
      if (index === heroIndex) btn.setAttribute("aria-current", "true");
      box.appendChild(btn);
    });
  }

  function goHero(index) {
    if (!heroSlides.length) return;
    heroIndex = (index + heroSlides.length) % heroSlides.length;
    setHero(heroSlides[heroIndex]);
    renderHeroDots();
  }

  function startHeroShow() {
    heroSlides = pickHeroSlides();
    heroIndex = 0;
    if (!heroSlides.length) return;
    setHero(heroSlides[0], true);
    renderHeroDots();
  }

  function setupHeroControls() {
    const hero = document.getElementById("hero");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("heroPrev")?.addEventListener("click", () => goHero(heroIndex - 1));
    document.getElementById("heroNext")?.addEventListener("click", () => goHero(heroIndex + 1));
    document.getElementById("heroDots")?.addEventListener("click", (event) => {
      const btn = event.target.closest(".cine-hero-dot");
      if (!btn) return;
      goHero(Number(btn.dataset.index));
    });
    document.getElementById("heroDots")?.addEventListener("animationend", (event) => {
      if (reduced || event.animationName !== "cineHeroProgress") return;
      if (!event.target.isConnected) return;
      if (hero.classList.contains("is-paused")) return;
      goHero(heroIndex + 1);
    });
    const pause = () => hero.classList.add("is-paused");
    const resume = () => {
      if (!document.body.classList.contains("is-filtered")) hero.classList.remove("is-paused");
    };
    hero.addEventListener("mouseenter", pause);
    hero.addEventListener("mouseleave", resume);
    hero.addEventListener("focusin", pause);
    hero.addEventListener("focusout", (event) => {
      if (!hero.contains(event.relatedTarget)) resume();
    });
  }

  function fillStats(dl, items) {
    dl.innerHTML = "";
    items.forEach(([label, value]) => {
      const div = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      div.appendChild(dt);
      div.appendChild(dd);
      dl.appendChild(div);
    });
  }

  function openMovie(mid) {
    const movie = catalog.movies[String(mid)];
    if (!movie) return;
    openMovieId = movie.id;
    modalMode = "movie";
    const modal = document.getElementById("detailModal");
    document.getElementById("detailActorExtras").hidden = true;
    document.querySelector(".cine-modal-body")?.classList.remove("is-actor");
    document.getElementById("detailKicker").textContent = langLabel(movie.origin_lang);
    document.getElementById("detailTitle").textContent = movieTitle(movie);
    document.getElementById("detailMeta").textContent = [
      movieMetaLine(movie),
      (movie.genres || []).slice(0, 3).join(" · "),
    ]
      .filter(Boolean)
      .join(" · ");
    fillStats(document.getElementById("detailStats"), [
      ["Đánh giá", movie.vote_average == null ? "—" : `${fmt.float(movie.vote_average, 1)} / 10`],
      ["Số vote", fmt.int(movie.vote_count)],
      ["Phổ biến", fmt.float(movie.popularity, 1)],
      ["Thời lượng", movie.runtime == null ? "—" : `${movie.runtime} phút`],
    ]);
    document.getElementById("detailOverview").textContent =
      movie.overview || "Không có tóm tắt.";

    document.getElementById("castSectionLabel").hidden = false;
    setPanelPhoto(
      document.getElementById("detailPoster"),
      posterUrl(movie.id, "hero") || posterUrl(movie.id, "card"),
      movie.id,
      "movie"
    );

    const cast = document.getElementById("detailCast");
    cast.innerHTML = "";
    (movie.cast || []).forEach((c) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cine-cast-btn";
      btn.appendChild(avatarEl(c.id, c.name));
      const text = document.createElement("span");
      text.className = "cine-cast-text";
      const name = document.createElement("span");
      name.className = "cast-name";
      name.textContent = c.name;
      const sub = document.createElement("span");
      sub.className = "cast-sub";
      sub.textContent = c.character ? `vai ${c.character}` : `bill #${c.order}`;
      text.appendChild(name);
      text.appendChild(sub);
      btn.appendChild(text);
      btn.addEventListener("click", () => {
        const actor = actorById.get(String(c.id));
        if (actor) openActor(actor);
      });
      li.appendChild(btn);
      cast.appendChild(li);
    });

    if (typeof modal.showModal === "function") modal.showModal();
    else modal.setAttribute("open", "");
    requestAnimationFrame(() => requestAnimationFrame(syncCastMore));
  }

  function syncCastMore() {
    const cast = document.getElementById("detailCast");
    const more = document.getElementById("castMore");
    if (!cast || !more) return;
    const leftover = cast.scrollHeight - cast.clientHeight - cast.scrollTop;
    more.hidden = leftover <= 8;
  }

  function openActor(actor) {
    modalMode = "actor";
    const modal = document.getElementById("detailModal");
    document.getElementById("detailActorExtras").hidden = false;
    document.querySelector(".cine-modal-body")?.classList.add("is-actor");
    document.getElementById("detailKicker").textContent = "Diễn viên";
    document.getElementById("detailTitle").textContent = actor.name;
    document.getElementById("detailMeta").textContent = "";
    fillStats(document.getElementById("detailStats"), [
      ["Số phim", fmt.int(actor.n_movies)],
      ["Degree", fmt.int(actor.degree)],
      ["Cộng đồng", actor.community == null ? "—" : `#${actor.community}`],
    ]);
    document.getElementById("detailOverview").textContent = "";

    document.getElementById("castSectionLabel").hidden = true;
    setPanelPhoto(
      document.getElementById("detailPoster"),
      actorPhotoUrl(actor.id, "profile") || actorPhotoUrl(actor.id, "face"),
      actor.id,
      "actor"
    );

    document.getElementById("linkGraphActor").href =
      `index.html?focus=${encodeURIComponent(actor.id)}&ego=1`;

    fillStats(document.getElementById("detailActorStats"), [
      ["Betweenness", fmt.float(actor.betweenness, 6)],
      ["Closeness", fmt.float(actor.closeness, 5)],
      ["Eigenvector", fmt.float(actor.eigenvector, 5)],
      ["Clustering", fmt.float(actor.clustering, 4)],
      ["Hub", fmt.float(actor.hub, 6)],
      ["Authority", fmt.float(actor.authority, 6)],
    ]);

    const cast = document.getElementById("detailCast");
    cast.innerHTML = "";
    cast.scrollTop = 0;
    syncCastMore();

    const rail = document.getElementById("actorFilmRail");
    rail.innerHTML = "";
    (actor.movie_ids || []).slice(0, 36).forEach((mid) => {
      const movie = catalog.movies[String(mid)];
      if (movie) rail.appendChild(movieCard(movie));
    });

    if (typeof modal.showModal === "function") modal.showModal();
    else modal.setAttribute("open", "");
  }

  function clearDetailParams() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("actor") && !url.searchParams.has("movie")) return;
    url.searchParams.delete("actor");
    url.searchParams.delete("movie");
    const next = `${url.pathname}${url.search}${url.hash}`;
    history.replaceState(null, "", next);
  }

  function closeModal() {
    const modal = document.getElementById("detailModal");
    if (typeof modal.close === "function") {
      if (modal.open) modal.close();
      else clearDetailParams();
      return;
    }
    modal.removeAttribute("open");
    clearDetailParams();
  }

  function setupSearch() {
    const input = document.getElementById("globalSearch");
    const drop = document.getElementById("searchDropdown");
    let active = -1;

    function hideDrop() {
      drop.hidden = true;
      active = -1;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }

    function markActive() {
      [...drop.querySelectorAll("button[role=option]")].forEach((btn, index) => {
        const on = index === active;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
        if (on) {
          btn.scrollIntoView({ block: "nearest" });
          input.setAttribute("aria-activedescendant", btn.id);
        }
      });
      if (active < 0) input.removeAttribute("aria-activedescendant");
    }

    function render(q) {
      drop.innerHTML = "";
      if (!q || q.length < 2) {
        hideDrop();
        return;
      }
      const lower = q.toLowerCase();
      const hits = [];
      for (const m of movieList) {
        if (movieTitleBlob(m).includes(lower)) {
          hits.push({ kind: "movie", item: m });
          if (hits.length >= 8) break;
        }
      }
      for (const a of catalog.actors) {
        if (a.name.toLowerCase().includes(lower)) {
          hits.push({ kind: "actor", item: a });
          if (hits.filter((h) => h.kind === "actor").length >= 6) break;
        }
      }
      if (!hits.length) {
        hideDrop();
        return;
      }
      hits.forEach((h, index) => {
        const li = document.createElement("li");
        li.setAttribute("role", "none");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = `searchOpt${index}`;
        btn.tabIndex = -1;
        btn.setAttribute("role", "option");
        btn.className = "cine-drop-btn";
        if (h.kind === "actor") {
          btn.appendChild(avatarEl(h.item.id, h.item.name));
        } else if (posterUrl(h.item.id)) {
          const thumb = document.createElement("span");
          thumb.className = "cine-drop-thumb";
          thumb.style.backgroundImage = `url("${posterUrl(h.item.id)}")`;
          btn.appendChild(thumb);
        }
        const meta = document.createElement("span");
        meta.className = "cine-drop-meta";
        const kind = document.createElement("span");
        kind.className = "drop-kind";
        kind.textContent = h.kind === "movie" ? "Phim" : "Diễn viên";
        const name = document.createElement("span");
        name.className = "drop-name";
        name.textContent = h.kind === "movie" ? movieTitle(h.item) : h.item.name;
        const sub = document.createElement("span");
        sub.className = "drop-sub";
        sub.textContent =
          h.kind === "movie"
            ? movieMetaLine(h.item)
            : `${fmt.int(h.item.n_movies)} phim`;
        meta.appendChild(kind);
        meta.appendChild(name);
        meta.appendChild(sub);
        btn.appendChild(meta);
        btn.addEventListener("click", () => {
          input.value = name.textContent;
          hideDrop();
          if (h.kind === "movie") openMovie(h.item.id);
          else openActor(h.item);
        });
        li.appendChild(btn);
        drop.appendChild(li);
      });
      drop.hidden = false;
      input.setAttribute("aria-expanded", "true");
      active = -1;
      markActive();
    }

    input.addEventListener("input", () => render(input.value.trim()));
    input.addEventListener("keydown", (e) => {
      const options = [...drop.querySelectorAll("button[role=option]")];
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && options.length && !drop.hidden) {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        active = active < 0 && step < 0 ? options.length - 1 : (active + step + options.length) % options.length;
        markActive();
      } else if (e.key === "Enter") {
        e.preventDefault();
        (options[active] || options[0])?.click();
      } else if (e.key === "Escape") {
        hideDrop();
      }
    });
    document.getElementById("searchForm").addEventListener("submit", (e) => e.preventDefault());
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".cine-search")) hideDrop();
    });
  }

  const GENRE_VI = {
    Action: "Hành động",
    Adventure: "Phiêu lưu",
    Animation: "Hoạt hình",
    Comedy: "Hài",
    Crime: "Tội phạm",
    Documentary: "Tài liệu",
    Drama: "Chính kịch",
    Family: "Gia đình",
    Fantasy: "Giả tưởng",
    History: "Lịch sử",
    Horror: "Kinh dị",
    Music: "Nhạc",
    Mystery: "Bí ẩn",
    Romance: "Lãng mạn",
    "Science Fiction": "Khoa học viễn tưởng",
    "TV Movie": "Phim truyền hình",
    Thriller: "Giật gân",
    War: "Chiến tranh",
    Western: "Cao bồi",
  };

  function genreLabel(name) {
    return GENRE_VI[name] || name;
  }

  function countryLabel(code) {
    return langLabel(code);
  }

  function yearLabel(value) {
    if (value === "older") return "Trước 1990";
    if (!value) return "";
    return `${value}–${Number(value) + 9}`;
  }

  function movieMatchesFilters(movie, filters) {
    if (filters.genre && !(movie.genres || []).includes(filters.genre)) return false;
    if (filters.country && originCode(movie) !== filters.country) return false;
    if (filters.year) {
      const y = Number(String(movie.release_date || "").slice(0, 4));
      if (!y) return false;
      if (filters.year === "older") return y < 1990;
      const start = Number(filters.year);
      if (y < start || y >= start + 10) return false;
    }
    return true;
  }

  function readFilters() {
    return {
      genre: document.getElementById("filterGenre")?.value || "",
      country: document.getElementById("filterCountry")?.value || "",
      year: document.getElementById("filterYear")?.value || "",
    };
  }

  function fillGenreOptions() {
    const select = document.getElementById("filterGenre");
    if (!select) return;
    const counts = new Map();
    movieList.forEach((movie) => {
      (movie.genres || []).forEach((genre) => {
        if (!genre || /^\d+$/.test(String(genre))) return;
        counts.set(genre, (counts.get(genre) || 0) + 1);
      });
    });
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 18)
      .forEach(([genre]) => {
        const option = document.createElement("option");
        option.value = genre;
        option.textContent = genreLabel(genre);
        select.appendChild(option);
      });
  }

  function syncHeaderOffset() {
    const header = document.querySelector(".cine-header");
    if (!header) return;
    document.body.style.setProperty("--cine-header-h", `${header.offsetHeight}px`);
  }

  function setupCatalogFilters() {
    fillGenreOptions();
    const form = document.getElementById("filterForm");
    const clear = document.getElementById("filterClear");
    const apply = () => {
      const filters = readFilters();
      const active = Boolean(filters.genre || filters.country || filters.year);
      document.body.classList.toggle("is-filtered", active);
      document.getElementById("hero")?.classList.toggle("is-paused", active);
      if (clear) clear.hidden = !active;
      if (!active) {
        buildBrowse();
        return;
      }
      const matched = movieList
        .filter((movie) => movieMatchesFilters(movie, filters))
        .sort((a, b) => scoreMovie(b) - scoreMovie(a));
      const rows = document.getElementById("rows");
      rows.innerHTML = "";
      const title = [genreLabel(filters.genre), countryLabel(filters.country), yearLabel(filters.year)]
        .filter(Boolean)
        .join(" · ");
      if (!matched.length) {
        const empty = document.createElement("p");
        empty.className = "cine-empty";
        empty.textContent = "Không có phim khớp bộ lọc.";
        rows.appendChild(empty);
        return;
      }
      rows.appendChild(renderGrid(title, matched, `${fmt.int(matched.length)} phim`));
    };
    form?.addEventListener("change", apply);
    form?.addEventListener("submit", (event) => event.preventDefault());
    clear?.addEventListener("click", () => {
      ["filterGenre", "filterCountry", "filterYear"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      apply();
    });
    syncHeaderOffset();
    window.addEventListener("resize", syncHeaderOffset);
  }

  function buildBrowse() {
    const rows = document.getElementById("rows");
    rows.innerHTML = "";

    const byCountry = (code) =>
      movieList
        .filter((movie) => originCode(movie) === code)
        .sort((a, b) => scoreMovie(b) - scoreMovie(a));

    const popular = [...movieList].sort((a, b) => scoreMovie(b) - scoreMovie(a)).slice(0, 28);
    const topRated = [...movieList]
      .filter((m) => (m.vote_count || 0) >= 80 && m.vote_average != null)
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
      .slice(0, 24);
    const us = byCountry("us").slice(0, 24);
    const gb = byCountry("gb").slice(0, 24);
    const vn = byCountry("vn").slice(0, 24);
    const kr = byCountry("kr").slice(0, 24);
    const recent = [...movieList]
      .filter((m) => m.release_date)
      .sort((a, b) => String(b.release_date).localeCompare(String(a.release_date)))
      .slice(0, 24);

    heroSlides = [];
    startHeroShow();

    rows.appendChild(renderRow("Thịnh hành", popular, `${fmt.int(popular.length)} phim`));
    if (us.length) rows.appendChild(renderRow("Điện ảnh Mỹ", us, `${fmt.int(byCountry("us").length)} phim`));
    if (gb.length) rows.appendChild(renderRow("Điện ảnh Anh", gb, `${fmt.int(byCountry("gb").length)} phim`));
    if (vn.length) rows.appendChild(renderRow("Điện ảnh Việt Nam", vn, `${fmt.int(byCountry("vn").length)} phim`));
    if (kr.length) rows.appendChild(renderRow("Điện ảnh Hàn Quốc", kr, `${fmt.int(byCountry("kr").length)} phim`));
    rows.appendChild(renderRow("Đánh giá cao", topRated));
    rows.appendChild(renderRow("Mới cập nhật", recent));
  }

  let uiReady = false;

  function refreshLists() {
    if (document.body.classList.contains("is-filtered")) {
      document.getElementById("filterForm")?.dispatchEvent(new Event("change"));
    } else {
      buildBrowse();
    }
  }

  function applyCatalog(data) {
    catalog = data;
    actorById = new Map((catalog.actors || []).map((a) => [String(a.id), a]));
    movieList = Object.values(catalog.movies || {});
    refreshLists();
    if (uiReady) return;
    uiReady = true;
    setupSearch();
    setupCatalogFilters();
    setupHeroControls();
    setupTitleLang();
    setupThemeToggle();

    document.getElementById("heroOpen").addEventListener("click", () => {
      if (heroMovie) openMovie(heroMovie.id);
    });
    document.getElementById("heroCast").addEventListener("click", () => {
      if (heroMovie) openMovie(heroMovie.id);
    });
    document.getElementById("btnCloseDetail").addEventListener("click", closeModal);
    document.getElementById("detailCast")?.addEventListener("scroll", syncCastMore);
    window.addEventListener("resize", syncCastMore);
    document.getElementById("detailModal").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeModal();
    });
    document.getElementById("detailModal").addEventListener("close", clearDetailParams);

    const actorId = queryParam("actor");
    const movieId = queryParam("movie");
    if (actorId && actorById.has(String(actorId))) openActor(actorById.get(String(actorId)));
    else if (movieId && catalog.movies[String(movieId)]) openMovie(movieId);
  }

  async function boot() {
    try {
      setLoading("Đang kiểm tra dữ liệu…");
      const [catalogData, posterData, actorData, titleData] = await Promise.all([
        loadJson("data/catalog.json"),
        loadJson("data/posters.json", { required: false }),
        loadJson("data/actor_photos.json", { required: false }),
        loadJson("data/titles.json", { required: false }),
      ]);
      if (!catalogData) throw new Error("catalog");
      posters = posterData || {};
      actorPhotos = actorData || {};
      titles = titleData || {};
      applyCatalog(catalogData);
      setLoading("", true);
    } catch (err) {
      console.error(err);
      showError("Không tải được catalog. Kiểm tra data/catalog.json.", err?.message ? String(err.message) : "");
    }
  }

  function setupTitleLang() {
    let saved = null;
    try {
      saved = localStorage.getItem("cineinfo-lang");
    } catch (_) {}
    if (saved === "vi" || saved === "en" || saved === "ko") titleLang = saved;
    const toggle = document.getElementById("langToggle");
    const menu = document.getElementById("langMenu");
    const flag = toggle?.querySelector(".cine-flag");
    const paint = () => {
      if (flag) flag.dataset.flag = titleLang;
      menu?.querySelectorAll("button").forEach((btn) => {
        const on = btn.dataset.lang === titleLang;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
    };
    const close = (returnFocus = false) => {
      if (!menu || menu.hidden) return;
      menu.hidden = true;
      toggle?.setAttribute("aria-expanded", "false");
      if (returnFocus) toggle?.focus();
    };
    paint();
    toggle?.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = menu?.hidden !== false;
      if (menu) menu.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) (menu.querySelector("button.is-active") || menu.querySelector("button"))?.focus();
    });
    menu?.addEventListener("keydown", (event) => {
      const items = [...menu.querySelectorAll("button[data-lang]")];
      const index = items.indexOf(document.activeElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        items[(index + step + items.length) % items.length]?.focus();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menu && !menu.hidden) {
        event.preventDefault();
        close(true);
      }
    });
    menu?.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-lang]");
      if (!btn) return;
      titleLang = btn.dataset.lang;
      try {
        localStorage.setItem("cineinfo-lang", titleLang);
      } catch (_) {}
      paint();
      close(true);
      if (document.body.classList.contains("is-filtered")) {
        document.getElementById("filterForm")?.dispatchEvent(new Event("change"));
      } else {
        buildBrowse();
      }
      const modal = document.getElementById("detailModal");
      if (modalMode === "movie" && openMovieId && modal?.open) {
        const movie = catalog.movies[String(openMovieId)];
        if (movie) document.getElementById("detailTitle").textContent = movieTitle(movie);
      }
      document.getElementById("globalSearch")?.dispatchEvent(new Event("input"));
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest("#titleLang")) close();
    });
  }

  boot();
})();
