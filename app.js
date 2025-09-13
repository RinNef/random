(() => {
  const canvas = document.getElementById('wheel');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  // Scale canvas for crisp lines on HiDPI (responsive)
  let baseSize = 520;
  function computeResponsiveSize() {
    const wrapper = canvas.parentElement;
    const max = 520;
    const min = 260;
    const w = wrapper ? wrapper.clientWidth : max;
    return Math.max(min, Math.min(max, Math.floor(w)));
  }
  function setupCanvas() {
    baseSize = computeResponsiveSize();
    const logical = baseSize;
    canvas.width = logical * dpr;
    canvas.height = logical * dpr;
    canvas.style.width = logical + 'px';
    canvas.style.height = logical + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setupCanvas();

  // State
  /** @type {{name:string, qty:number, color:string}[]} */
  let entries = [];
  let currentAngle = 0; // radians, rotation of wheel
  let isSpinning = false;
  let history = [];
  // Persisted, fully expanded ticket arrangement for stronger shuffling
  // Each ticket: { name, color }
  let ticketArrangement = [];

  const elements = {
    form: document.getElementById('entry-form'),
    name: document.getElementById('name'),
    qty: document.getElementById('qty'),
    list: document.getElementById('entry-list'),
    spinBtn: document.getElementById('spin-btn'),
    spinX1: document.getElementById('spin-x1'),
    spinX3: document.getElementById('spin-x3'),
    spinX5: document.getElementById('spin-x5'),
    spinX10: document.getElementById('spin-x10'),
    shuffleBtn: document.getElementById('shuffle-btn'),
    modeToggle: document.getElementById('mode-toggle'),
    resetRotationBtn: document.getElementById('reset-rotation-btn'),
    clearBtn: document.getElementById('clear-btn'),
    result: document.getElementById('result'),
    historyList: document.getElementById('history-list'),
    historyContainer: document.getElementById('history-container'),
    listContainer: document.getElementById('list-container'),
    listDrag: document.getElementById('list-drag'),
    toggleList: document.getElementById('toggle-list'),
    listSummary: document.getElementById('list-summary'),
    cardArea: document.getElementById('card-area'),
    card: document.getElementById('card'),
    cardFront: document.getElementById('card-front'),
    cardBack: document.getElementById('card-back'),
    drawCardBtn: document.getElementById('draw-card-btn'),
    drawX1: document.getElementById('draw-x1'),
    drawX3: document.getElementById('draw-x3'),
    drawX5: document.getElementById('draw-x5'),
    drawX10: document.getElementById('draw-x10'),
  };

  // Persistence
  const LS_KEY = 'weighted-wheel-entries-v1';
  const LS_ANGLE_KEY = 'weighted-wheel-angle-v1';
  const LS_HISTORY_KEY = 'weighted-wheel-history-v1';
  const LS_TICKETS_KEY = 'weighted-wheel-tickets-arrangement-v1';
  const LS_COLLAPSE_KEY = 'weighted-wheel-list-collapsed-v1';
  const LS_LIST_HEIGHT_KEY = 'weighted-wheel-list-height-v1';
  const LS_MODE_KEY = 'weighted-wheel-mode-v1'; // 'wheel' | 'card'
  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
    localStorage.setItem(LS_ANGLE_KEY, String(currentAngle));
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(history.slice(0, 200)));
    localStorage.setItem(LS_TICKETS_KEY, JSON.stringify(ticketArrangement));
    if (elements.listContainer) {
      localStorage.setItem(LS_COLLAPSE_KEY, elements.listContainer.dataset.collapsed === '1' ? '1' : '0');
      localStorage.setItem(LS_LIST_HEIGHT_KEY, elements.listContainer.style.height || '');
    }
    if (elements.modeToggle) {
      localStorage.setItem(LS_MODE_KEY, currentMode);
    }
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const angleRaw = localStorage.getItem(LS_ANGLE_KEY);
      const histRaw = localStorage.getItem(LS_HISTORY_KEY);
      const ticketsRaw = localStorage.getItem(LS_TICKETS_KEY);
      const collapsedRaw = localStorage.getItem(LS_COLLAPSE_KEY);
      const listHeightRaw = localStorage.getItem(LS_LIST_HEIGHT_KEY);
      const modeRaw = localStorage.getItem(LS_MODE_KEY);
      if (raw) entries = JSON.parse(raw);
      if (!Array.isArray(entries)) entries = [];
      if (angleRaw) currentAngle = Number(angleRaw) || 0;
      if (histRaw) history = JSON.parse(histRaw) || [];
      if (ticketsRaw) ticketArrangement = JSON.parse(ticketsRaw) || [];
      if (elements.listContainer) {
        if (collapsedRaw === '1') {
          elements.listContainer.dataset.collapsed = '1';
        }
        if (listHeightRaw) {
          elements.listContainer.style.height = listHeightRaw;
        }
      }
      if (modeRaw === 'card') currentMode = 'card';
    } catch {}
  }
  load();

  // Mode handling
  let currentMode = 'wheel';
  function applyMode() {
    const isCard = currentMode === 'card';
    if (elements.cardArea) {
      elements.cardArea.hidden = !isCard;
      elements.cardArea.style.display = isCard ? 'grid' : 'none';
    }
    if (elements.modeToggle) elements.modeToggle.textContent = isCard ? 'Chế độ: Rút thẻ' : 'Chế độ: Vòng quay';
    // Show/hide wheel & pointer
    canvas.style.display = isCard ? 'none' : 'block';
    const pointerEl = document.querySelector('.pointer');
    if (pointerEl) pointerEl.style.display = isCard ? 'none' : 'block';
    // Disable spin controls in card mode
    elements.spinBtn.disabled = isCard;
    if (elements.spinX1) elements.spinX1.disabled = isCard;
    if (elements.spinX3) elements.spinX3.disabled = isCard;
    if (elements.spinX5) elements.spinX5.disabled = isCard;
    if (elements.spinX10) elements.spinX10.disabled = isCard;
    if (elements.resetRotationBtn) elements.resetRotationBtn.disabled = isCard;
    // Disable card controls in wheel mode
    if (elements.drawCardBtn) elements.drawCardBtn.disabled = !isCard;
    if (elements.drawX1) elements.drawX1.disabled = !isCard;
    if (elements.drawX3) elements.drawX3.disabled = !isCard;
    if (elements.drawX5) elements.drawX5.disabled = !isCard;
    if (elements.drawX10) elements.drawX10.disabled = !isCard;
  }

  // Utilities
  function randomColor(seedStr) {
    // Deterministic color from name
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    return `hsl(${hue} 75% 50%)`;
  }

  function rebuildTicketsFromEntriesRandom() {
    const tickets = [];
    for (const e of entries) {
      for (let i = 0; i < e.qty; i++) tickets.push({ name: e.name, color: e.color });
    }
    for (let i = tickets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = tickets[i]; tickets[i] = tickets[j]; tickets[j] = tmp;
    }
    ticketArrangement = tickets;
  }

  function ensureArrangementConsistent() {
    const expected = totalQty();
    if (!Array.isArray(ticketArrangement) || ticketArrangement.length !== expected) {
      rebuildTicketsFromEntriesRandom();
      return;
    }
    // Verify counts match
    const countByName = new Map();
    for (const t of ticketArrangement) {
      const key = t.name.toLowerCase();
      countByName.set(key, (countByName.get(key) || 0) + 1);
    }
    for (const e of entries) {
      const key = e.name.toLowerCase();
      if ((countByName.get(key) || 0) !== e.qty) { rebuildTicketsFromEntriesRandom(); return; }
    }
  }

  function getTickets() {
    ensureArrangementConsistent();
    return ticketArrangement.slice();
  }

  function totalQty() {
    return entries.reduce((s, e) => s + e.qty, 0);
  }

  // Drawing
  function drawWheel() {
    const size = baseSize;
    ctx.clearRect(0, 0, size, size);
    const radius = size / 2 - 8;
    const cx = size / 2;
    const cy = size / 2;

    const tickets = getTickets();
    const n = tickets.length || 1;
    const anglePer = (Math.PI * 2) / n;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(currentAngle);

    for (let i = 0; i < n; i++) {
      const start = i * anglePer;
      const end = start + anglePer;
      const t = tickets[i] || { name: '—', color: '#374151' };

      // slice
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = t.color;
      ctx.fill();

      // divider
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius, start, start);
      ctx.lineTo(0, 0);
      ctx.stroke();

      // label
      const mid = start + anglePer / 2;
      ctx.save();
      ctx.rotate(mid);
      ctx.translate(radius * 0.7, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#0b1224';
      ctx.font = 'bold 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      const label = t.name;
      const metrics = ctx.measureText(label);
      ctx.fillText(label, -metrics.width / 2, 4);
      ctx.restore();
    }

    // outer ring
    ctx.beginPath();
    ctx.arc(0, 0, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.restore();
  }

  function renderList() {
    elements.list.innerHTML = '';
    if (entries.length === 0) {
      const li = document.createElement('li');
      li.className = 'entry-item';
      li.textContent = 'Chưa có tên nào. Hãy thêm ở trên.';
      elements.list.appendChild(li);
      // vẫn tiếp tục để xử lý chiều cao/ẩn hiện bên dưới
    }
    // Update summary info
    if (elements.listSummary) {
      const total = totalQty();
      const unique = entries.length;
      elements.listSummary.textContent = unique ? `${unique} tên • ${total} vé` : '0 tên • 0 vé';
    }
    for (const e of entries) {
      const li = document.createElement('li');
      li.className = 'entry-item';
      const left = document.createElement('div');
      const dot = document.createElement('span');
      dot.className = 'color-dot';
      dot.style.background = e.color;
      left.appendChild(dot);
      const name = document.createElement('strong');
      name.textContent = e.name;
      left.appendChild(name);
      li.appendChild(left);

      const right = document.createElement('div');
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = String(e.qty);
      right.appendChild(badge);

      const mini = document.createElement('div');
      mini.className = 'mini-actions';

      const inc = document.createElement('button');
      inc.className = 'mini-btn';
      inc.textContent = '+1';
      inc.onclick = () => updateQty(e.name, e.qty + 1);

      const dec = document.createElement('button');
      dec.className = 'mini-btn';
      dec.textContent = '-1';
      dec.onclick = () => updateQty(e.name, Math.max(0, e.qty - 1));

      const rem = document.createElement('button');
      rem.className = 'mini-btn';
      rem.textContent = 'Xóa';
      rem.onclick = () => removeName(e.name);

      mini.appendChild(inc);
      mini.appendChild(dec);
      mini.appendChild(rem);

      right.appendChild(mini);
      li.appendChild(right);
      elements.list.appendChild(li);
    }
    // Adjust body height if container is expanded
    if (elements.listContainer) {
      const collapsed = elements.listContainer.dataset.collapsed === '1';
      if (!collapsed && !elements.listContainer.style.height) {
        // default height
        elements.listContainer.style.height = '220px';
      }
      elements.listContainer.style.overflow = collapsed ? 'hidden' : 'auto';
      elements.listContainer.style.height = collapsed ? '0px' : (elements.listContainer.style.height || '220px');
      // cập nhật attribute để CSS có thể ẩn drag-handle
      elements.listContainer.setAttribute('data-collapsed', collapsed ? '1' : '0');
    }
  }

  function renderHistory() {
    elements.historyList.innerHTML = '';
    if (!history.length) {
      const li = document.createElement('li');
      li.className = 'entry-item';
      li.textContent = 'Chưa có lịch sử.';
      elements.historyList.appendChild(li);
      return;
    }
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      const li = document.createElement('li');
      li.className = 'entry-item';
      const left = document.createElement('div');
      const dot = document.createElement('span');
      dot.className = 'color-dot';
      dot.style.background = h.color || '#64748b';
      left.appendChild(dot);
      const name = document.createElement('strong');
      name.textContent = h.name;
      left.appendChild(name);
      li.appendChild(left);

      const right = document.createElement('div');
      const time = document.createElement('span');
      time.className = 'badge';
      const dt = new Date(h.time);
      time.textContent = dt.toLocaleTimeString();
      right.appendChild(time);
      li.appendChild(right);
      elements.historyList.appendChild(li);
    }
  }

  function upsertName(rawName, qty) {
    const name = String(rawName || '').trim();
    if (!name) return;
    if (!Number.isFinite(qty) || qty < 0) qty = 0;
    const idx = entries.findIndex(e => e.name.toLowerCase() === name.toLowerCase());
    if (idx >= 0) {
      entries[idx].qty = qty;
      if (!entries[idx].color) entries[idx].color = randomColor(entries[idx].name);
    } else {
      entries.push({ name, qty, color: randomColor(name) });
    }
    entries = entries.filter(e => e.qty > 0);
    rebuildTicketsFromEntriesRandom();
    save();
    drawWheel();
    renderList();
  }

  function updateQty(name, qty) {
    upsertName(name, qty);
  }

  function removeName(name) {
    entries = entries.filter(e => e.name.toLowerCase() !== String(name).toLowerCase());
    rebuildTicketsFromEntriesRandom();
    save();
    drawWheel();
    renderList();
  }

  function chooseWinnerIndex(tickets, finalAngle) {
    // The pointer is at canvas top (12 o'clock). With currentAngle, after rotation to finalAngle, which slice is at pointer?
    const anglePer = (Math.PI * 2) / tickets.length;
    // Normalize angle [0, 2pi)
    const norm = ((finalAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    // The 0 rad points to 3 o'clock in canvas arc math; our top pointer means subtract pi/2
    const pointerAngle = (-Math.PI / 2 - norm + Math.PI * 2) % (Math.PI * 2);
    let index = Math.floor(pointerAngle / anglePer);
    if (!Number.isFinite(index)) index = 0;
    return index;
  }

  function spin() {
    if (isSpinning) return;
    const tickets = getTickets();
    const n = tickets.length;
    if (n === 0) {
      elements.result.textContent = 'Chưa có vé nào để quay.';
      return;
    }
    isSpinning = true;
    setSpinButtonsDisabled(true);

    // Spin with several rotations plus random offset
    const extraRotations = 5 + Math.floor(Math.random() * 4); // 5-8 turns
    const randomOffset = Math.random() * Math.PI * 2;
    const startAngle = currentAngle;
    const endAngle = startAngle + extraRotations * Math.PI * 2 + randomOffset;
    const duration = 3500 + Math.random() * 800; // ms

    const startTime = performance.now();

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function frame(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      currentAngle = startAngle + (endAngle - startAngle) * eased;
      drawWheel();
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        // finalize
        currentAngle = endAngle;
        const idx = chooseWinnerIndex(tickets, currentAngle);
        const winner = tickets[idx];
        if (winner) {
          elements.result.textContent = `Kết quả: ${winner.name}`;
          // decrement one ticket for winner
          const ent = entries.find(e => e.name.toLowerCase() === winner.name.toLowerCase());
          if (ent && ent.qty > 0) ent.qty -= 1;
          entries = entries.filter(e => e.qty > 0);
          // remove exact ticket from arrangement by index to keep randomness
          ensureArrangementConsistent();
          if (Array.isArray(ticketArrangement) && ticketArrangement.length > 0) {
            ticketArrangement.splice(idx, 1);
          }
          history.push({ name: winner.name, color: winner.color, time: Date.now() });
          save();
          renderList();
          renderHistory();
          drawWheel();
        } else {
          elements.result.textContent = 'Không xác định được kết quả.';
        }
        isSpinning = false;
        setSpinButtonsDisabled(false);
        // resolve any pending multi-spin promise if present
        if (pendingResolve) {
          const r = pendingResolve; pendingResolve = null; r();
        }
      }
    }

    requestAnimationFrame(frame);
  }

  function setSpinButtonsDisabled(disabled) {
    elements.spinBtn.disabled = disabled;
    if (elements.spinX1) elements.spinX1.disabled = disabled;
    if (elements.spinX3) elements.spinX3.disabled = disabled;
    if (elements.spinX5) elements.spinX5.disabled = disabled;
    if (elements.spinX10) elements.spinX10.disabled = disabled;
    if (elements.shuffleBtn) elements.shuffleBtn.disabled = disabled;
    elements.clearBtn.disabled = disabled;
    elements.resetRotationBtn.disabled = disabled;
  }

  function setUiDisabled(disabled) {
    setSpinButtonsDisabled(disabled);
    if (elements.drawCardBtn) elements.drawCardBtn.disabled = disabled;
    if (elements.drawX1) elements.drawX1.disabled = disabled;
    if (elements.drawX3) elements.drawX3.disabled = disabled;
    if (elements.drawX5) elements.drawX5.disabled = disabled;
    if (elements.drawX10) elements.drawX10.disabled = disabled;
  }

  // Shuffle tickets thoroughly and persist
  function shuffleEntries() {
    rebuildTicketsFromEntriesRandom();
    save();
    drawWheel();
    renderList();
  }

  // Multi-spin support
  let pendingResolve = null;
  function spinOnceAsync() {
    return new Promise(resolve => {
      if (isSpinning) return resolve();
      pendingResolve = resolve;
      spin();
    });
  }
  async function spinTimes(times) {
    setSpinButtonsDisabled(true);
    for (let i = 0; i < times; i++) {
      if (totalQty() === 0) break;
      await spinOnceAsync();
      // tiny delay between spins for UX
      await new Promise(r => setTimeout(r, 300));
    }
    setSpinButtonsDisabled(false);
  }

  // Utilities for single-animation multi-spin
  function selectRandomIndex(tickets) {
    return Math.floor(Math.random() * tickets.length);
  }

  function applyWinWithoutAnimation(tickets, index) {
    const winner = tickets[index];
    if (!winner) return null;
    const ent = entries.find(e => e.name.toLowerCase() === winner.name.toLowerCase());
    if (ent && ent.qty > 0) ent.qty -= 1;
    entries = entries.filter(e => e.qty > 0);
    ensureArrangementConsistent();
    if (Array.isArray(ticketArrangement) && ticketArrangement.length > 0) {
      ticketArrangement.splice(index, 1);
    }
    history.push({ name: winner.name, color: winner.color, time: Date.now() });
    return winner;
  }

  function animateToIndex(tickets, targetIndex) {
    if (isSpinning) return Promise.resolve();
    if (!tickets.length) return Promise.resolve();
    isSpinning = true;
    setSpinButtonsDisabled(true);
    const anglePer = (Math.PI * 2) / tickets.length;
    const startAngle = currentAngle;
    // desired final normalized angle so that pointer points to middle of target slice
    const targetPointerAngle = targetIndex * anglePer + anglePer / 2; // [0, 2pi)
    let desiredNorm = (-Math.PI / 2 - targetPointerAngle) % (Math.PI * 2);
    if (desiredNorm < 0) desiredNorm += Math.PI * 2;
    const startNorm = ((startAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const extraRotations = 5 + Math.floor(Math.random() * 4); // 5-8 turns
    const deltaToDesired = ((desiredNorm - startNorm) + Math.PI * 2) % (Math.PI * 2);
    const endAngle = startAngle + extraRotations * Math.PI * 2 + deltaToDesired;
    const duration = 3500 + Math.random() * 800;
    const startTime = performance.now();

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    return new Promise(resolve => {
      function frame(now) {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        const eased = easeOutCubic(t);
        currentAngle = startAngle + (endAngle - startAngle) * eased;
        drawWheel();
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          currentAngle = endAngle;
          // finalize: compute based on our constructed target index
          const winner = tickets[targetIndex];
          if (winner) {
            elements.result.textContent = `Kết quả: ${winner.name}`;
            applyWinWithoutAnimation(tickets, targetIndex);
            save();
            renderList();
            renderHistory();
            drawWheel();
          }
          isSpinning = false;
          setSpinButtonsDisabled(false);
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  async function multiSpinSingleAnimation(times) {
    if (times <= 0) return;
    ensureArrangementConsistent();
    if (totalQty() === 0) return;
    setSpinButtonsDisabled(true);
    // Apply times-1 wins silently
    for (let i = 0; i < times - 1; i++) {
      const tickets = getTickets();
      if (!tickets.length) break;
      const idx = selectRandomIndex(tickets);
      applyWinWithoutAnimation(tickets, idx);
    }
    // Final visible spin to the last winner
    const finalTickets = getTickets();
    if (!finalTickets.length) { setSpinButtonsDisabled(false); return; }
    const finalIdx = selectRandomIndex(finalTickets);
    await animateToIndex(finalTickets, finalIdx);
  }

  // Events
  elements.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = elements.name.value.trim();
    const qty = Math.max(0, parseInt(elements.qty.value, 10) || 0);
    upsertName(name, qty);
    elements.name.value = '';
    elements.qty.value = '1';
    elements.name.focus();
  });

  elements.spinBtn.addEventListener('click', spin);
  if (elements.spinX1) elements.spinX1.addEventListener('click', () => multiSpinSingleAnimation(1));
  if (elements.spinX3) elements.spinX3.addEventListener('click', () => multiSpinSingleAnimation(3));
  if (elements.spinX5) elements.spinX5.addEventListener('click', () => multiSpinSingleAnimation(5));
  if (elements.spinX10) elements.spinX10.addEventListener('click', () => multiSpinSingleAnimation(10));
  if (elements.shuffleBtn) elements.shuffleBtn.addEventListener('click', () => { if (!isSpinning) shuffleEntries(); });
  elements.clearBtn.addEventListener('click', () => {
    if (isSpinning) return;
    if (!confirm('Xóa tất cả tên và số lượng?')) return;
    entries = [];
    elements.result.textContent = '';
    save();
    renderList();
    drawWheel();
  });
  elements.resetRotationBtn.addEventListener('click', () => {
    if (isSpinning) return;
    currentAngle = 0;
    save();
    drawWheel();
  });
  // Mode toggle
  if (elements.modeToggle) {
    elements.modeToggle.addEventListener('click', () => {
      currentMode = currentMode === 'wheel' ? 'card' : 'wheel';
      applyMode();
      save();
    });
  }

  // Draw card
  if (elements.drawCardBtn && elements.card && elements.cardBack && elements.cardFront) {
    const drawOnce = () => {
      ensureArrangementConsistent();
      const tickets = getTickets();
      if (!tickets.length) { elements.result.textContent = 'Chưa có vé nào để rút.'; return; }
      setUiDisabled(true);
      elements.card.classList.remove('flip');
      elements.cardFront.textContent = '?';
      setTimeout(() => {
        // pick winner
        const idx = Math.floor(Math.random() * tickets.length);
        const winner = tickets[idx];
        elements.cardBack.textContent = winner.name;
        elements.cardBack.style.color = winner.color;
        elements.card.classList.add('flip');
        // apply win after flip duration
        setTimeout(() => {
          applyWinWithoutAnimation(tickets, idx);
          elements.result.textContent = `Kết quả: ${winner.name}`;
          save();
          renderList();
          renderHistory();
          drawWheel();
          setUiDisabled(false);
        }, 650);
      }, 50);
    };
    elements.drawCardBtn.addEventListener('click', drawOnce);
    if (elements.drawX1) elements.drawX1.addEventListener('click', drawOnce);
    const multiDraw = async (times) => {
      if (times <= 0) return;
      setUiDisabled(true);
      // Apply times-1 draws silently
      for (let i = 0; i < times - 1; i++) {
        ensureArrangementConsistent();
        const tickets = getTickets();
        if (!tickets.length) break;
        const idx = Math.floor(Math.random() * tickets.length);
        applyWinWithoutAnimation(tickets, idx);
      }
      // Final visible flip
      ensureArrangementConsistent();
      const tickets = getTickets();
      if (!tickets.length) { setUiDisabled(false); return; }
      elements.card.classList.remove('flip');
      elements.cardFront.textContent = '?';
      await new Promise(r => setTimeout(r, 50));
      const idx = Math.floor(Math.random() * tickets.length);
      const winner = tickets[idx];
      elements.cardBack.textContent = winner.name;
      elements.cardBack.style.color = winner.color;
      elements.card.classList.add('flip');
      await new Promise(r => setTimeout(r, 650));
      applyWinWithoutAnimation(tickets, idx);
      elements.result.textContent = `Kết quả: ${winner.name}`;
      save();
      renderList();
      renderHistory();
      drawWheel();
      setUiDisabled(false);
    };
    if (elements.drawX3) elements.drawX3.addEventListener('click', () => multiDraw(3));
    if (elements.drawX5) elements.drawX5.addEventListener('click', () => multiDraw(5));
    if (elements.drawX10) elements.drawX10.addEventListener('click', () => multiDraw(10));
  }

  // Collapsible toggle
  if (elements.toggleList && elements.listContainer) {
    elements.toggleList.addEventListener('click', () => {
      const collapsed = elements.listContainer.dataset.collapsed === '1';
      elements.listContainer.dataset.collapsed = collapsed ? '0' : '1';
      renderList();
      save();
    });
  }

  // Draggable height for list container
  if (elements.listDrag && elements.listContainer) {
    let dragging = false;
    let startY = 0;
    let startH = 0;
    const onMove = (e) => {
      if (!dragging) return;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dy = clientY - startY;
      const newH = Math.max(100, Math.min(500, startH + dy));
      elements.listContainer.style.height = newH + 'px';
    };
    const onUp = () => { dragging = false; save(); };
    elements.listDrag.addEventListener('mousedown', (e) => {
      if (elements.listContainer.dataset.collapsed === '1') return;
      dragging = true; startY = e.clientY; startH = parseInt(elements.listContainer.style.height || '220', 10);
      e.preventDefault();
    });
    elements.listDrag.addEventListener('touchstart', (e) => {
      if (elements.listContainer.dataset.collapsed === '1') return;
      dragging = true; startY = e.touches[0].clientY; startH = parseInt(elements.listContainer.style.height || '220', 10);
    }, { passive: true });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
  }

  window.addEventListener('beforeunload', save);
  // Redraw on resize for responsive canvas
  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      const oldSize = baseSize;
      setupCanvas();
      if (baseSize !== oldSize) drawWheel();
    });
  });

  // Initial render
  drawWheel();
  renderList();
  renderHistory();
  applyMode();
})();


