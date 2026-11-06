(() => {
  const { fmt, setLoading, showError, setupThemeToggle, escapeHtml, queryParam, loadJson } = window.SNA;
  const IMG_FACE = "https://image.tmdb.org/t/p/w185";

  const COMMUNITY_COLORS = [
    "#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2",
    "#e11d48", "#65a30d", "#0284c7", "#ea580c", "#0d9488", "#c026d3",
  ];
  const MOON_COLORS = [
    "#b7ccff", "#8fd9c8", "#d8c8ff", "#f0ddb0", "#9ec8f5", "#c9d6ef",
    "#7ec8dc", "#c4b6ef", "#e7d2a4", "#a8ddd0", "#d4c4f2", "#e4ecff",
  ];
  const EDGE_SOFT_CAP = 12000;
  const EDGE_HARD_CAP = 20000;

  let graph = null;
  let networkPayload = null;
  let networkNodeById = new Map();
  let selectedActorId = null;
  let degreeScale = { min: 1, max: 100 };
  let controlsHooked = false;
  let hoveredNode = null;
  let floatRaf = 0;
  let allNodes = [];
  let allEdges = [];
  let adjacency = new Map(); // id -> Set(neighborId)
  let filterState = { region: "all", minDegree: 1, showEdges: true, egoDepth: 0, egoHop: 1 };
  let egoLayoutRadius = 220;
  let actorPhotos = {};
  let actorSearchIndex = [];
  let floatKey = "";
  let floatPos = "";
  const moveKeys = new Set();
  // Vector3 tạo lười từ camera (không phụ thuộc window.THREE lúc tải script)
  let camLook = null;
  let camRight = null;
  let camDelta = null;
  let cameraKeysStarted = false;
  let moveRaf = 0;

  function canvasBg() {
    return getComputedStyle(document.documentElement).getPropertyValue("--canvas-bg").trim() || "#070b14";
  }

  function actorPhotoUrl(id) {
    const path = actorPhotos[String(id)];
    if (!path) return "";
    return `${IMG_FACE}${path}`;
  }

  function initials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  function linkOpacityFor(nodeCount) {
    if (filterState.egoDepth > 0) return isDarkTheme() ? 0.82 : 0.95;
    if (nodeCount > 8000) return isDarkTheme() ? 0.34 : 0.42;
    return isDarkTheme() ? 0.55 : 0.62;
  }

  function linkWidthFor(link) {
    const width = 0.85 + (Number(link?.weight) || 1) * 0.32;
    return Math.min(filterState.egoDepth > 0 ? 3.4 : 2.4, width);
  }

  function isTypingTarget(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  }

  /** Phím di chuyển chỉ áp dụng khi focus ở body hoặc trong khung đồ thị. */
  function keyTargetsGraph(event) {
    if (isTypingTarget(event.target)) return false;
    const active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) return true;
    const container = document.getElementById("graphContainer");
    return Boolean(container && container.contains(active));
  }

  function startCameraKeys() {
    if (cameraKeysStarted) return;
    cameraKeysStarted = true;
    const moveCodes = new Set([
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "KeyA",
      "KeyD",
      "KeyW",
      "KeyS",
    ]);
    window.addEventListener("keydown", (event) => {
      if (!moveCodes.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) return;
      if (!keyTargetsGraph(event)) return;
      moveKeys.add(event.code);
      event.preventDefault();
      if (!moveRaf) moveRaf = requestAnimationFrame(tick);
    });
    window.addEventListener("keyup", (event) => {
      moveKeys.delete(event.code);
    });
    window.addEventListener("blur", () => moveKeys.clear());
    // Vòng rAF chỉ chạy khi đang giữ phím, tự dừng khi thả hết
    const tick = () => {
      moveRaf = 0;
      if (graph && moveKeys.size) {
        const controls = graph.controls?.();
        const cam = graph.camera?.();
        if (controls && cam) {
          if (!camLook) {
            camLook = cam.position.clone();
            camRight = cam.position.clone();
            camDelta = cam.position.clone();
          }
          const step = Math.max(2.2, cameraDistance() * 0.028);
          cam.getWorldDirection(camLook);
          camRight.crossVectors(camLook, cam.up).normalize();
          camDelta.set(0, 0, 0);
          if (moveKeys.has("ArrowUp") || moveKeys.has("KeyW")) camDelta.addScaledVector(camLook, step);
          if (moveKeys.has("ArrowDown") || moveKeys.has("KeyS")) camDelta.addScaledVector(camLook, -step);
          if (moveKeys.has("ArrowLeft") || moveKeys.has("KeyA")) camDelta.addScaledVector(camRight, -step);
          if (moveKeys.has("ArrowRight") || moveKeys.has("KeyD")) camDelta.addScaledVector(camRight, step);
          cam.position.add(camDelta);
          controls.target.add(camDelta);
          controls.update();
        }
        moveRaf = requestAnimationFrame(tick);
      }
    };
  }

  function linkColor() {
    const fromCss = getComputedStyle(document.documentElement)
      .getPropertyValue("--canvas-link")
      .trim();
    if (fromCss) return fromCss;
    const dark = document.documentElement.getAttribute("data-theme") !== "light";
    return dark ? "rgba(186,210,255,0.72)" : "rgba(30,64,175,0.35)";
  }

  function isDarkTheme() {
    return document.documentElement.getAttribute("data-theme") !== "light";
  }

  function communityColor(id) {
    const palette = isDarkTheme() ? MOON_COLORS : COMMUNITY_COLORS;
    return palette[Math.abs(Number(id) || 0) % palette.length];
  }

  function recomputeDegreeScale(nodes) {
    let min = Infinity;
    let max = 0;
    nodes.forEach((n) => {
      const d = Number(n.degree) || 0;
      if (d < min) min = d;
      if (d > max) max = d;
    });
    if (!Number.isFinite(min)) min = 1;
    if (max <= min) max = min + 1;
    degreeScale = { min, max };
  }

  function nodeValFromDegree(degree) {
    const d = Math.max(Number(degree) || 1, 1);
    const { min, max } = degreeScale;
    const t =
      (Math.log(d) - Math.log(Math.max(min, 1))) /
      (Math.log(max) - Math.log(Math.max(min, 1)) || 1);
    const clamped = Math.max(0, Math.min(1, t));
    return 1.4 + Math.pow(clamped, 0.75) * 24;
  }

  function preparePayload(payload) {
    const nodes = (payload.nodes || []).map((n) => ({ ...n, kind: "actor" }));
    const edges = payload.edges || [];
    recomputeDegreeScale(nodes);
    return {
      ...payload,
      nodes,
      edges,
      meta: {
        ...(payload.meta || {}),
        view_n_nodes: nodes.length,
        view_n_edges: edges.length,
      },
    };
  }

  function buildAdjacency() {
    adjacency = new Map();
    const touch = (a, b) => {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      if (!adjacency.has(b)) adjacency.set(b, new Set());
      adjacency.get(a).add(b);
      adjacency.get(b).add(a);
    };
    allEdges.forEach((e) => {
      touch(String(e.source?.id || e.source), String(e.target?.id || e.target));
    });
    Object.entries(networkPayload?.neighbors || {}).forEach(([id, list]) => {
      (list || []).forEach((n) => touch(String(id), String(n.id)));
    });
  }

  function egoDistances(centerId, depth) {
    const cid = String(centerId);
    const dist = new Map([[cid, 0]]);
    let frontier = [cid];
    const steps = Math.max(1, Number(depth) || 1);
    for (let step = 0; step < steps; step += 1) {
      const next = [];
      frontier.forEach((id) => {
        const neigh = adjacency.get(id);
        if (!neigh) return;
        neigh.forEach((nid) => {
          if (dist.has(nid)) return;
          dist.set(nid, step + 1);
          next.push(nid);
        });
      });
      frontier = next;
    }
    return dist;
  }

  /** Layout ego cục bộ — không dùng tọa độ toàn cục (tránh node kéo xa → graph “xẹp”). */
  function layoutEgoLocal(nodes, links, centerId, distances) {
    const cid = String(centerId);
    const weightOf = new Map();
    links.forEach((e) => {
      const s = String(e.source?.id || e.source);
      const t = String(e.target?.id || e.target);
      const w = Number(e.weight) || 1;
      const other = s === cid ? t : t === cid ? s : null;
      if (other != null) weightOf.set(other, Math.max(weightOf.get(other) || 0, w));
    });

    const others = nodes.filter((n) => String(n.id) !== cid);
    const byHop = (hop) =>
      others
        .filter((n) => (distances?.get(String(n.id)) || 1) === hop)
        .sort(
          (a, b) =>
            (weightOf.get(String(b.id)) || 0) - (weightOf.get(String(a.id)) || 0) ||
            (b.degree || 0) - (a.degree || 0)
        );
    const direct = byHop(1);
    const golden = Math.PI * (3 - Math.sqrt(5));
    let radius = 36 + Math.min(70, 12 * Math.sqrt(Math.max(direct.length, 1)));

    const placed = new Map();
    placed.set(cid, { x: 0, y: 0, z: 0 });
    const placeShell = (list, shellRadius, pullWeight) => {
      const count = Math.max(list.length, 1);
      list.forEach((node, i) => {
        const w = weightOf.get(String(node.id)) || 1;
        const pull = pullWeight ? 0.72 + 0.35 / Math.sqrt(w) : 1;
        const ring = shellRadius * pull;
        const y = 1 - (2 * i) / Math.max(count - 1, 1);
        const rim = Math.sqrt(Math.max(1 - y * y, 0.05));
        const theta = golden * i;
        placed.set(String(node.id), {
          x: Math.cos(theta) * rim * ring,
          y: y * ring * 0.55,
          z: Math.sin(theta) * rim * ring,
        });
      });
    };
    placeShell(direct, radius, true);
    let maxHop = 1;
    distances?.forEach((hop) => {
      if (hop > maxHop) maxHop = hop;
    });
    for (let hop = 2; hop <= maxHop; hop += 1) {
      const shell = byHop(hop);
      if (!shell.length) continue;
      radius += 36 + Math.min(48, 3.2 * Math.sqrt(shell.length));
      placeShell(shell, radius, false);
    }
    egoLayoutRadius = radius;

    // Clone — không mutate allNodes (giữ layout full graph)
    return nodes.map((n) => {
      const p = placed.get(String(n.id)) || { x: 0, y: 0, z: 0 };
      return {
        ...n,
        x: p.x,
        y: p.y,
        z: p.z,
        fx: p.x,
        fy: p.y,
        fz: p.z,
        hop: distances?.get(String(n.id)) || 0,
      };
    });
  }

  function nodePassesFilter(n, { skipDegree = false } = {}) {
    if (!skipDegree && (n.degree || 0) < filterState.minDegree) return false;
    if (filterState.region === "all") return true;
    if (filterState.region === "us") return Boolean(n.us);
    if (filterState.region === "gb") return Boolean(n.gb);
    if (filterState.region === "vn") return Boolean(n.vn);
    if (filterState.region === "kr") return Boolean(n.kr);
    return true;
  }

  function buildVisibleGraph() {
    let nodes = allNodes.filter((n) => nodePassesFilter(n));
    let distances = null;
    if (filterState.egoDepth > 0 && selectedActorId) {
      distances = egoDistances(selectedActorId, filterState.egoDepth);
      const center = networkNodeById.get(String(selectedActorId));
      nodes = allNodes.filter((n) => {
        if (!distances.has(String(n.id))) return false;
        if (String(n.id) === String(selectedActorId)) return true;
        return nodePassesFilter(n, { skipDegree: true });
      });
      if (center && !nodes.some((n) => String(n.id) === String(center.id))) {
        nodes = [center, ...nodes];
      }
    }

    const idSet = new Set(nodes.map((n) => String(n.id)));
    let links = [];
    if (filterState.showEdges) {
      links = allEdges.filter(
        (e) =>
          idSet.has(String(e.source?.id || e.source)) &&
          idSet.has(String(e.target?.id || e.target))
      );
      if (filterState.egoDepth === 1 && selectedActorId) {
        const cid = String(selectedActorId);
        links = links.filter(
          (e) => String(e.source?.id || e.source) === cid || String(e.target?.id || e.target) === cid
        );
      }
      const soft = nodes.length > 6000 ? EDGE_SOFT_CAP : EDGE_HARD_CAP;
      if (links.length > soft) {
        links = [...links].sort((a, b) => (b.weight || 1) - (a.weight || 1)).slice(0, soft);
      }
    }

    if (filterState.egoDepth > 0 && selectedActorId) {
      nodes = layoutEgoLocal(nodes, links, selectedActorId, distances);
      // Clone cạnh để 3d-force-graph không giữ reference source/target object cũ
      links = links.map((e) => ({
        source: String(e.source?.id || e.source),
        target: String(e.target?.id || e.target),
        weight: e.weight,
      }));
    }

    return { nodes, links };
  }

  function frameEgoCamera(nodeCount, animate = true) {
    if (!graph?.cameraPosition) return;
    const count = nodeCount || graph.graphData?.().nodes?.length || 40;
    const indirect = filterState.egoDepth > 1;
    const z = indirect ? Math.min(1600, Math.max(280, egoLayoutRadius * 2.4)) : 220;
    graph.cameraPosition(
      { x: 0, y: indirect ? 60 : count > 160 ? 48 : 20, z },
      { x: 0, y: 0, z: 0 },
      animate ? 550 : 0
    );
    setTimeout(refreshZoomVisuals, animate ? 600 : 40);
  }

  function paintRange(input) {
    if (!input) return;
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const pct = max > min ? ((Number(input.value) - min) / (max - min)) * 100 : 0;
    input.style.setProperty("--fill", `${pct}%`);
  }

  function syncEgoControls() {
    const direct = document.getElementById("egoDirect");
    const indirect = document.getElementById("egoIndirect");
    const hopRow = document.getElementById("egoHopRow");
    const hop = document.getElementById("egoHop");
    const hopVal = document.getElementById("egoHopVal");
    const btnClear = document.getElementById("btnEgoClear");
    const hasSel = Boolean(selectedActorId);
    if (direct) {
      direct.disabled = !hasSel;
      direct.checked = filterState.egoDepth === 1;
    }
    if (indirect) {
      indirect.disabled = !hasSel;
      indirect.checked = filterState.egoDepth > 1;
    }
    if (hop) {
      hop.value = String(filterState.egoHop);
      paintRange(hop);
    }
    if (hopVal) hopVal.textContent = String(filterState.egoHop);
    if (hopRow) hopRow.hidden = filterState.egoDepth <= 1;
    if (btnClear) btnClear.hidden = filterState.egoDepth === 0;
  }

  function setEgoDepth(depth, animate = true) {
    const next = depth > 0 ? depth : 0;
    if (next > 0 && !selectedActorId) {
      const hint = document.getElementById("filterHint");
      if (hint) hint.textContent = "Hãy chọn một node trên đồ thị trước.";
      syncEgoControls();
      return;
    }
    filterState.egoDepth = next;
    if (next > 1) filterState.egoHop = next - 1;
    syncEgoControls();
    applyNetworkFilter();
    if (next > 0 && selectedActorId) {
      frameEgoCamera((graph?.graphData().nodes || []).length, animate);
    } else if (next === 0 && graph?.cameraPosition) {
      graph.cameraPosition({ x: 0, y: 80, z: 980 }, { x: 0, y: 0, z: 0 }, 700);
      setTimeout(refreshZoomVisuals, 750);
    }
  }

  function applyNetworkFilter() {
    if (!graph) return;
    const { nodes, links } = buildVisibleGraph();
    recomputeDegreeScale(nodes.length ? nodes : allNodes);
    graph.graphData({ nodes, links });
    const stats = document.getElementById("filterStats");
    if (stats) {
      let text =
        `Đang vẽ ${fmt.int(nodes.length)} / ${fmt.int(allNodes.length)} đỉnh · ` +
        `${fmt.int(links.length)} cạnh`;
      if (filterState.egoDepth > 0 && selectedActorId) {
        const name = networkNodeById.get(String(selectedActorId))?.name || selectedActorId;
        const scope = filterState.egoDepth > 1 ? `gián tiếp ${filterState.egoHop} bậc` : "trực tiếp";
        text += ` · ${scope}: ${name}`;
      } else if (networkPayload?.meta?.full_graph) {
        text += " · layout cố định";
      }
      stats.textContent = text;
    }
    const hint = document.getElementById("filterHint");
    if (hint && networkPayload?.meta?.region_actor_counts && filterState.egoDepth === 0) {
      const rc = networkPayload.meta.region_actor_counts;
      hint.textContent =
        `Mỹ: ${fmt.int(rc.us || 0)} · Anh: ${fmt.int(rc.gb || 0)} · VN: ${fmt.int(rc.vn || 0)} · KR: ${fmt.int(rc.kr || 0)} diễn viên (có thể giao nhau).`;
    } else if (hint && filterState.egoDepth === 1) {
      hint.textContent = "Đang xem các node có cạnh nối trực tiếp với node đã chọn.";
    } else if (hint && filterState.egoDepth > 1) {
      hint.textContent =
        `Đang xem node nối trực tiếp và node cách tối đa ${filterState.egoHop} bậc gián tiếp.`;
    }
    syncEgoControls();
  }

  function setupFilters() {
    const region = document.getElementById("regionFilter");
    const minDeg = document.getElementById("minDegree");
    const minDegVal = document.getElementById("minDegreeVal");
    const showEdges = document.getElementById("showEdges");
    const egoDirect = document.getElementById("egoDirect");
    const egoIndirect = document.getElementById("egoIndirect");
    const egoHop = document.getElementById("egoHop");
    const btnClear = document.getElementById("btnEgoClear");
    if (!region || !minDeg || !showEdges) return;

    const sync = () => {
      filterState.region = region.value;
      filterState.minDegree = Number(minDeg.value) || 1;
      filterState.showEdges = showEdges.checked;
      minDegVal.textContent = String(filterState.minDegree);
      paintRange(minDeg);
      applyNetworkFilter();
    };
    paintRange(minDeg);
    region.addEventListener("change", sync);
    minDeg.addEventListener("input", sync);
    showEdges.addEventListener("change", sync);

    [egoDirect, egoIndirect].forEach((input) => {
      if (!input) return;
      input.addEventListener("change", () => {
        if (!input.checked) return;
        setEgoDepth(input.value === "indirect" ? 1 + filterState.egoHop : 1);
      });
    });
    if (egoHop) {
      egoHop.addEventListener("input", () => {
        filterState.egoHop = Number(egoHop.value) || 1;
        const hopVal = document.getElementById("egoHopVal");
        if (hopVal) hopVal.textContent = String(filterState.egoHop);
        if (filterState.egoDepth > 1) setEgoDepth(1 + filterState.egoHop, false);
      });
    }
    if (btnClear) {
      btnClear.addEventListener("click", () => setEgoDepth(0));
    }
    syncEgoControls();
    setupGraphSearch();
  }

  function foldSearch(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\uac00-\ud7af\u3130-\u318f\u4e00-\u9fff]+/g, " ")
      .trim();
  }

  function buildActorSearchIndex() {
    actorSearchIndex = allNodes.map((node) => ({
      node,
      name: foldSearch(node.name),
    }));
  }

  function searchActors(query) {
    const q = foldSearch(query);
    if (q.length < 2) return [];
    const tokens = q.split(" ").filter(Boolean);
    const hits = [];
    actorSearchIndex.forEach((entry) => {
      if (!entry.name || !tokens.every((token) => entry.name.includes(token))) return;
      let score = Math.min(Number(entry.node.degree) || 0, 400);
      if (entry.name === q) score += 1000;
      else if (entry.name.startsWith(q)) score += 500;
      else if (entry.name.split(" ").some((part) => part.startsWith(tokens[0]))) score += 200;
      hits.push({ node: entry.node, score });
    });
    hits.sort(
      (a, b) => b.score - a.score || String(a.node.name).localeCompare(String(b.node.name))
    );
    return hits.slice(0, 8).map((hit) => hit.node);
  }

  function focusActorFromSearch(id) {
    const node = networkNodeById.get(String(id));
    if (!node) return;
    selectedActorId = node.id;
    hoveredNode = null;
    showActorPanel(node);
    if (!filterState.egoDepth) filterState.egoDepth = 1;
    syncEgoControls();
    applyNetworkFilter();
    frameEgoCamera((graph?.graphData().nodes || []).length);
    startFloatLabelLoop();
  }

  function setupGraphSearch() {
    const form = document.getElementById("graphSearchForm");
    const input = document.getElementById("graphSearch");
    const drop = document.getElementById("graphSearchDrop");
    if (!form || !input || !drop || form.dataset.ready === "1") return;
    form.dataset.ready = "1";
    let active = -1;

    function setExpanded(open) {
      input.setAttribute("aria-expanded", open ? "true" : "false");
      if (!open) input.removeAttribute("aria-activedescendant");
    }

    function hideDrop() {
      drop.hidden = true;
      drop.innerHTML = "";
      active = -1;
      setExpanded(false);
    }

    function markActive() {
      const buttons = [...drop.querySelectorAll("button")];
      buttons.forEach((button, index) => {
        const on = index === active;
        button.classList.toggle("is-active", on);
        button.setAttribute("aria-selected", on ? "true" : "false");
        if (on) {
          button.scrollIntoView({ block: "nearest" });
          input.setAttribute("aria-activedescendant", button.id);
        }
      });
      if (active < 0) input.removeAttribute("aria-activedescendant");
    }

    function choose(node) {
      input.value = node.name;
      hideDrop();
      focusActorFromSearch(node.id);
    }

    function render(query) {
      const hits = searchActors(query);
      drop.innerHTML = "";
      active = hits.length ? 0 : -1;
      if (foldSearch(query).length < 2) {
        hideDrop();
        return;
      }
      if (!hits.length) {
        const li = document.createElement("li");
        li.setAttribute("role", "none");
        const note = document.createElement("p");
        note.className = "graph-search-empty";
        note.textContent = "Không có diễn viên khớp.";
        li.appendChild(note);
        drop.appendChild(li);
        drop.hidden = false;
        setExpanded(true);
        return;
      }
      hits.forEach((node, index) => {
        const li = document.createElement("li");
        li.setAttribute("role", "none");
        const button = document.createElement("button");
        button.type = "button";
        button.id = `graphSearchOpt${index}`;
        button.tabIndex = -1;
        button.setAttribute("role", "option");
        const photo = actorPhotoUrl(node.id);
        if (photo) {
          const img = document.createElement("img");
          img.className = "graph-search-photo";
          img.alt = "";
          img.src = photo;
          button.appendChild(img);
        } else {
          const fallback = document.createElement("span");
          fallback.className = "graph-search-fallback";
          fallback.textContent = initials(node.name);
          button.appendChild(fallback);
        }
        const copy = document.createElement("span");
        copy.className = "graph-search-copy";
        const name = document.createElement("span");
        name.className = "graph-search-name";
        name.textContent = node.name;
        const sub = document.createElement("span");
        sub.className = "graph-search-sub";
        sub.textContent = `${fmt.int(node.degree)} kết nối · ${fmt.int(node.n_movies)} phim`;
        copy.appendChild(name);
        copy.appendChild(sub);
        button.appendChild(copy);
        button.addEventListener("click", () => choose(node));
        li.appendChild(button);
        drop.appendChild(li);
      });
      drop.hidden = false;
      setExpanded(true);
      markActive();
    }

    input.addEventListener("input", () => render(input.value));
    input.addEventListener("keydown", (event) => {
      const buttons = [...drop.querySelectorAll("button")];
      if (event.key === "ArrowDown" && buttons.length) {
        event.preventDefault();
        active = (active + 1) % buttons.length;
        markActive();
      } else if (event.key === "ArrowUp" && buttons.length) {
        event.preventDefault();
        active = (active - 1 + buttons.length) % buttons.length;
        markActive();
      } else if (event.key === "Enter") {
        event.preventDefault();
        const pick = buttons[active] || buttons[0];
        pick?.click();
      } else if (event.key === "Escape") {
        hideDrop();
      }
    });
    form.addEventListener("submit", (event) => event.preventDefault());
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".graph-search")) hideDrop();
    });
  }

  function fillStats(meta) {
    document.getElementById("statNodes").textContent = fmt.int(meta.n_nodes);
    document.getElementById("statEdges").textContent = fmt.int(meta.n_edges);
    document.getElementById("statDensity").textContent = fmt.float(meta.density, 5);
    document.getElementById("statModularity").textContent = fmt.float(meta.modularity, 4);
    const pathNote = meta.path_metrics_approximate ? "≈" : "";
    document.getElementById("statPath").textContent = pathNote + fmt.float(meta.avg_path_length, 3);
    document.getElementById("statDiameter").textContent = pathNote + fmt.int(meta.diameter);
    document.getElementById("viewNote").textContent = meta.full_graph
      ? `Full graph: ${fmt.int(meta.view_n_nodes)} đỉnh (layout cố định). Dùng bộ lọc vùng/degree để xem rõ.`
      : `Khung 3D: ${fmt.int(meta.view_n_nodes)} đỉnh / ${fmt.int(meta.view_n_edges)} cạnh.`;
  }

  function fillBridges(top) {
    const list = document.getElementById("bridgeList");
    list.innerHTML = "";
    (top.betweenness || []).forEach((t) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `${t.name} · ${fmt.float(t.value, 5)}`;
      btn.addEventListener("click", () => selectActor(t.id));
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function fillLegend(communities) {
    const box = document.getElementById("communityLegend");
    box.innerHTML = "";
    (communities || []).forEach((c) => {
      const li = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = communityColor(c.id);
      const text = document.createElement("span");
      text.textContent = `#${c.id} · ${fmt.int(c.size)} — ${(c.sample_actors || []).slice(0, 3).join(", ")}`;
      li.appendChild(swatch);
      li.appendChild(text);
      box.appendChild(li);
    });
  }

  function fillHistogram(hist) {
    const box = document.getElementById("degreeHist");
    box.innerHTML = "";
    if (!hist?.degrees?.length) return;
    const pairs = hist.degrees.map((d, i) => [d, hist.counts[i]]);
    const maxDeg = pairs[pairs.length - 1][0];
    const bins = 40;
    const width = Math.max(1, Math.ceil((maxDeg + 1) / bins));
    const buckets = new Array(bins).fill(0);
    pairs.forEach(([d, c]) => {
      buckets[Math.min(bins - 1, Math.floor(d / width))] += c;
    });
    const maxC = Math.max(...buckets, 1);
    buckets.forEach((c) => {
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.height = `${Math.max(2, (c / maxC) * 100)}%`;
      bar.title = `${c} diễn viên`;
      box.appendChild(bar);
    });
  }

  function showActorPanel(node) {
    document.getElementById("actorHint").hidden = true;
    document.getElementById("actorContent").hidden = false;
    document.getElementById("actorName").textContent = node.name;
    document.getElementById("mMovies").textContent = fmt.int(node.n_movies);
    document.getElementById("mCommunity").textContent =
      node.community == null ? "—" : `#${node.community}`;
    document.getElementById("mDegree").textContent = fmt.int(node.degree);
    document.getElementById("mBetweenness").textContent = fmt.float(node.betweenness, 6);
    document.getElementById("mCloseness").textContent = fmt.float(node.closeness, 5);
    document.getElementById("mEigen").textContent = fmt.float(node.eigenvector, 5);
    document.getElementById("mClustering").textContent = fmt.float(node.clustering, 4);
    document.getElementById("mHub").textContent = fmt.float(node.hub, 6);
    document.getElementById("mAuthority").textContent = fmt.float(node.authority, 6);

    const link = document.getElementById("linkExploreActor");
    if (link) {
      link.href = `explore.html?actor=${encodeURIComponent(node.id)}`;
      link.hidden = false;
      link.textContent = `Tra cứu phim · ${node.name}`;
    }

    const coList = document.getElementById("coactorList");
    coList.innerHTML = "";
    const neigh = (networkPayload.neighbors && networkPayload.neighbors[node.id]) || [];
    if (!neigh.length) {
      const li = document.createElement("li");
      li.textContent = "Không có đồng diễn top trong dữ liệu neighbors.";
      coList.appendChild(li);
    } else {
      neigh.forEach((n) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = `${n.name} · ${n.weight} phim chung`;
        btn.addEventListener("click", () => selectActor(n.id));
        li.appendChild(btn);
        coList.appendChild(li);
      });
    }
  }

  function cameraDistance() {
    if (!graph) return 400;
    const cam = graph.camera();
    return Math.hypot(cam.position.x, cam.position.y, cam.position.z) || 400;
  }

  function updateFloatLabel() {
    const el = document.getElementById("graphFloatLabel");
    const wrap = document.querySelector(".viewport-wrap");
    if (!el || !wrap || !graph) return;

    const node =
      hoveredNode ||
      (selectedActorId
        ? (graph.graphData().nodes || []).find((n) => String(n.id) === String(selectedActorId))
        : null);
    if (!node || node.x == null) {
      el.hidden = true;
      floatPos = "";
      return;
    }

    const coords = graph.graph2ScreenCoords(node.x, node.y, node.z);
    const rect = wrap.getBoundingClientRect();
    if (coords.x < 8 || coords.y < 8 || coords.x > rect.width - 8 || coords.y > rect.height - 8) {
      el.hidden = true;
      floatPos = "";
      return;
    }

    let title = node.name || "";
    if (title.length > 42) title = `${title.slice(0, 40)}…`;
    let sub = "";
    if (node.degree != null) {
      sub = `Degree ${fmt.int(node.degree)}`;
      if (node.community != null) sub += ` · Cộng đồng #${node.community}`;
    }
    const photo = actorPhotoUrl(node.id);
    const key = `${node.id}|${title}|${sub}|${photo}`;
    if (key !== floatKey) {
      floatKey = key;
      const portrait = photo
        ? `<img class="float-photo" src="${escapeHtml(photo)}" alt="">`
        : `<span class="float-photo float-photo-fallback" aria-hidden="true">${escapeHtml(initials(node.name))}</span>`;
      const subHtml = sub ? `<span class="float-sub">${escapeHtml(sub)}</span>` : "";
      el.innerHTML = `<span class="float-row">${portrait}<span class="float-copy">${escapeHtml(title)}${subHtml}</span></span>`;
    }
    const pos = `${Math.round(coords.x)},${Math.round(coords.y)}`;
    if (pos !== floatPos) {
      floatPos = pos;
      el.style.left = `${Math.round(coords.x)}px`;
      el.style.top = `${Math.round(coords.y)}px`;
    }
    el.hidden = false;
  }

  /** Bám nhãn theo node chỉ khi có node hover/chọn; không có thì dừng hẳn vòng rAF. */
  function startFloatLabelLoop() {
    if (floatRaf) return;
    const tick = () => {
      if (!graph || (!hoveredNode && !selectedActorId)) {
        floatRaf = 0;
        updateFloatLabel();
        return;
      }
      updateFloatLabel();
      floatRaf = requestAnimationFrame(tick);
    };
    floatRaf = requestAnimationFrame(tick);
  }

  function refreshZoomVisuals() {
    if (!graph) return;
    const dist = cameraDistance();
    const res = dist < 160 ? 18 : dist < 280 ? 12 : 8;
    if (graph.nodeResolution() !== res) graph.nodeResolution(res);
    const rel = dist < 160 ? 7.5 : dist < 280 ? 5.5 : 4.2;
    if (graph.nodeRelSize() !== rel) graph.nodeRelSize(rel);
    const hint = document.getElementById("zoomHint");
    if (hint) {
      hint.textContent =
        dist < 180
          ? "Zoom gần · hover để xem tên · WASD hoặc mũi tên để di chuyển"
          : "Kéo để xoay · cuộn để zoom · WASD hoặc mũi tên để di chuyển";
    }
    updateFloatLabel();
  }

  function configureGraphBase() {
    const container = document.getElementById("graphContainer");
    const frozen = Boolean(networkPayload?.meta?.full_graph);
    if (!graph) {
      graph = ForceGraph3D({ controlType: "orbit" })(container)
        .backgroundColor(canvasBg())
        .showNavInfo(false)
        .enableNodeDrag(false)
        .linkDirectionalParticles(0)
        .nodeRelSize(5)
        .warmupTicks(0)
        .cooldownTicks(0)
        .cooldownTime(0)
        .d3AlphaDecay(1)
        .d3VelocityDecay(1);

      const renderer = graph.renderer();
      if (renderer) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      }

      const resize = () => {
        graph.width(container.clientWidth);
        graph.height(container.clientHeight);
        refreshZoomVisuals();
      };
      resize();
      if (typeof ResizeObserver === "function") {
        let resizeRaf = 0;
        new ResizeObserver(() => {
          cancelAnimationFrame(resizeRaf);
          resizeRaf = requestAnimationFrame(resize);
        }).observe(container);
      } else {
        window.addEventListener("resize", resize);
      }
    }

    if (!controlsHooked && graph.controls) {
      const controls = graph.controls();
      if (controls?.addEventListener) {
        controls.addEventListener("change", refreshZoomVisuals);
        controls.enablePan = true;
        controlsHooked = true;
      }
    }
    startCameraKeys();

    if (frozen) {
      graph.d3Force("charge")?.strength(0);
      graph.d3Force("link")?.strength(0);
      graph.d3Force("center")?.strength(0);
    }

    graph.width(container.clientWidth).height(container.clientHeight);
    return graph;
  }

  function focusGraphNode(id) {
    if (!graph) return;
    const node = (graph.graphData().nodes || []).find((n) => String(n.id) === String(id));
    if (!node) return;
    const hypot = Math.hypot(node.x || 1, node.y || 1, node.z || 1) || 1;
    const distRatio = 1 + 110 / hypot;
    graph.cameraPosition(
      {
        x: (node.x || 0) * distRatio,
        y: (node.y || 0) * distRatio,
        z: (node.z || 0) * distRatio,
      },
      node,
      650
    );
    setTimeout(refreshZoomVisuals, 700);
  }

  function selectActor(id) {
    const node = networkNodeById.get(String(id));
    if (!node) return;
    selectedActorId = node.id;
    hoveredNode = null;
    showActorPanel(node);
    syncEgoControls();
    startFloatLabelLoop();
    if (filterState.egoDepth > 0) {
      applyNetworkFilter();
      frameEgoCamera((graph?.graphData().nodes || []).length);
    } else {
      focusGraphNode(node.id);
    }
    updateFloatLabel();
  }

  function renderNetworkGraph() {
    hoveredNode = null;
    const frozen = Boolean(networkPayload?.meta?.full_graph);
    const created = !graph;
    const { nodes, links } = buildVisibleGraph();
    recomputeDegreeScale(nodes.length ? nodes : allNodes);

    configureGraphBase()
      .graphData({ nodes, links })
      .backgroundColor(canvasBg())
      .nodeId("id")
      .nodeLabel(() => null)
      .nodeVal((n) => {
        const base = nodeValFromDegree(n.degree);
        // Node đang chọn to hơn (nodeOpacity của 3d-force-graph chỉ nhận số, không nhận hàm)
        if (selectedActorId && String(n.id) === String(selectedActorId)) {
          return base * 1.65;
        }
        return base;
      })
      .nodeColor((n) => {
        if (selectedActorId && String(n.id) === String(selectedActorId)) {
          return isDarkTheme() ? "#f3e6c4" : "#c2410c";
        }
        if (filterState.egoDepth > 1 && n.hop > 1) {
          return isDarkTheme() ? "#8ea0c4" : "#64748b";
        }
        if (filterState.egoDepth > 0 && selectedActorId) {
          return communityColor(n.community ?? 0);
        }
        if (filterState.region !== "all") {
          return communityColor(n.community ?? 0);
        }
        const flags = [n.us, n.gb, n.vn, n.kr].filter(Boolean).length;
        if (flags === 1 && n.us) return isDarkTheme() ? "#9ec5f5" : "#1d4ed8";
        if (flags === 1 && n.gb) return isDarkTheme() ? "#d7c4f3" : "#7c3aed";
        if (flags === 1 && n.vn) return isDarkTheme() ? "#8ee0c8" : "#059669";
        if (flags === 1 && n.kr) return isDarkTheme() ? "#f0c4a0" : "#ea580c";
        return communityColor(n.community ?? 0);
      })
      .nodeOpacity(isDarkTheme() ? 0.9 : 0.95)
      .nodeResolution(frozen && nodes.length > 8000 ? 4 : 6)
      .linkWidth((l) => linkWidthFor(l))
      .linkOpacity(linkOpacityFor(nodes.length))
      .linkColor(() => linkColor())
      .nodeThreeObject(() => null)
      .nodeThreeObjectExtend(false)
      .onNodeHover((n) => {
        hoveredNode = n || null;
        document.body.style.cursor = n ? "pointer" : "default";
        updateFloatLabel();
        if (n) startFloatLabelLoop();
      })
      .onNodeClick((n) => selectActor(n.id));

    applyNetworkFilter();
    startFloatLabelLoop();
    requestAnimationFrame(() => {
      refreshZoomVisuals();
      if (created && frozen && graph.cameraPosition) {
        graph.cameraPosition({ x: 0, y: 80, z: 980 }, { x: 0, y: 0, z: 0 }, 800);
      }
    });
  }

  let graphBooted = false;

  function showNetwork(raw, { focus = false } = {}) {
    networkPayload = preparePayload(raw);
    allNodes = networkPayload.nodes;
    allEdges = networkPayload.edges || [];
    networkNodeById = new Map(allNodes.map((n) => [String(n.id), n]));
    buildActorSearchIndex();
    buildAdjacency();

    fillStats(networkPayload.meta || {});
    fillBridges(networkPayload.top || {});
    fillLegend(networkPayload.meta?.top_communities || []);
    fillHistogram(networkPayload.meta?.degree_histogram);

    const focusId = queryParam("focus") || queryParam("actor");
    const focusNode = focusId ? networkNodeById.get(String(focusId)) : null;
    if (!graphBooted) {
      if (focusNode && queryParam("ego") === "1") {
        selectedActorId = focusNode.id;
        filterState.egoDepth = 1;
      }
      setupFilters();
      graphBooted = true;
    }
    renderNetworkGraph();
    if (focus && focusNode) {
      setTimeout(() => selectActor(focusNode.id), 400);
    }
  }

  async function boot() {
    if (typeof window.ForceGraph3D !== "function") {
      setupThemeToggle();
      showError(
        "Không tải được thư viện đồ thị 3D (3d-force-graph / three.js).",
        "Thư viện được tải từ unpkg.com — hãy kiểm tra kết nối mạng hoặc trình chặn quảng cáo rồi thử lại."
      );
      return;
    }
    try {
      setupThemeToggle(() => {
        if (graph) {
          const n = (graph.graphData().nodes || []).length;
          graph.backgroundColor(canvasBg());
          graph.linkColor(() => linkColor());
          graph.nodeColor(graph.nodeColor());
          graph.nodeOpacity(isDarkTheme() ? 0.9 : 0.95);
          graph.linkOpacity(linkOpacityFor(n));
        }
        if (networkPayload) fillLegend(networkPayload.meta?.top_communities || []);
      });
      setLoading("Đang kiểm tra dữ liệu…");
      const [raw, photos] = await Promise.all([
        loadJson("data/network_data.json"),
        loadJson("data/actor_photos.json", { required: false }),
      ]);
      actorPhotos = photos || {};
      showNetwork(raw, { focus: true });
      setLoading("", true);
      document.body.classList.add("is-ready");
    } catch (err) {
      console.error(err);
      showError("Không tải được data/network_data.json.", err?.message ? String(err.message) : "");
    }
  }

  boot();
})();
