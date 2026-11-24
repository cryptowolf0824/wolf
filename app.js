(function () {
  const C = window.PositionCalc;
  let state = C.loadSample("cap300");
  let refSeq = 0;
  let customTimer = 0;

  const $ = (id) => document.getElementById(id);

  function step() {
    return C.resolveStep(state);
  }

  function current() {
    return C.compute(C.stateToInput(state, step()));
  }

  function initSymbols() {
    const select = $("symbol");
    C.SYMBOLS.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.id;
      select.appendChild(option);
    });
    const custom = document.createElement("option");
    custom.value = "CUSTOM";
    custom.textContent = "自定义";
    select.appendChild(custom);
  }

  function shortMessage(msg) {
    if (msg.startsWith("请填写大于 0 的止损")) return "止损需 > 0";
    if (msg.startsWith("请填写大于 0 的额定")) return "额定亏需 > 0";
    if (msg.startsWith("数量步长")) return "步长需 > 0";
    if (msg.startsWith("请填写大于 0 的杠杆")) return "杠杆需 > 0";
    if (msg.startsWith("没有有效档位")) return "无有效档";
    if (msg.startsWith("即使只下一个")) return "一步即超限，数量为 0";
    if (msg.startsWith("就近取整会超过")) return "已向下取整";
    if (msg.startsWith("有档位数量不是")) return "数量未对齐步长";
    return "";
  }

  function rowTag(row) {
    if (!row) return "";
    if (row.invalidReason) {
      if (row.invalidReason.indexOf("高于止损") >= 0 || row.invalidReason.indexOf("低于止损") >= 0) return "忽略";
      if (row.invalidReason.indexOf("未填写") >= 0) return "";
      return "无效";
    }
    if (row.qtyWarning && row.qtyWarning.indexOf("步长") >= 0) return "步长";
    if (row.qtyWarning) return "无效";
    return "";
  }

  function setStatus() {
    const badge = $("status-badge");
    badge.textContent = state.equalQty ? "等量" : "已打破";
    badge.dataset.mode = state.equalQty ? "equal" : "broken";
  }

  function syncControls() {
    $("symbol").value = state.symbol;
    $("custom-symbol").value = state.customSymbol;
    $("custom-step").value = state.customStep;
    $("stop-loss").value = state.stopLoss;
    $("loss-cap").value = state.lossCap;
    $("leverage").value = state.leverage;
    $("direction").value = state.direction === "short" ? "short" : "long";
    $("custom-fields").hidden = state.symbol !== "CUSTOM";
    paintChrome();
  }

  function stepFact() {
    const parsed = C.parseDecimal(step());
    if (parsed === null || parsed <= 0n) return "—";
    return C.formatTrim(parsed);
  }

  function paintMessages(result) {
    const box = $("message-list");
    box.replaceChildren();
    result.errors.concat(result.warnings, result.notes).forEach((msg) => {
      const text = shortMessage(msg);
      if (!text) return;
      const chip = document.createElement("span");
      chip.className = "chip-warn";
      chip.textContent = text;
      box.appendChild(chip);
    });
  }

  function paintSummary(result) {
    $("total-qty").textContent = result.totalQtyText || "—";
    $("avg-price").textContent = result.avgPriceText || "—";
    $("total-loss").textContent = result.totalLossText || "—";
    $("total-margin").textContent = result.totalMarginFixed2 || "—";
    const exact = $("margin-exact");
    exact.textContent = result.totalMarginText && result.totalMarginText !== result.totalMarginFixed2
      ? result.totalMarginText
      : "";
    $("fill-dir").textContent = state.direction === "long" ? "高→低" : "低→高";
  }

  function rowTemplate() {
    const tr = document.createElement("tr");
    tr.innerHTML = [
      '<td><input class="price cell-in" type="text" inputmode="decimal" autocomplete="off" aria-label="价"></td>',
      '<td><input class="qty cell-in" type="text" inputmode="decimal" autocomplete="off" aria-label="量"></td>',
      '<td class="loss"></td>',
      '<td class="notional"></td>',
      '<td class="margin"></td>',
      '<td><span class="tag"></span><button type="button" class="x" data-remove="1" aria-label="删除档位">×</button></td>'
    ].join("");
    return tr;
  }

  function paintTiers(result) {
    const body = $("tier-body");
    const ids = new Set(state.tiers.map((tier) => tier.id));
    body.querySelectorAll("tr").forEach((tr) => {
      if (!ids.has(tr.dataset.id)) tr.remove();
    });
    state.tiers.forEach((tier, index) => {
      let tr = body.querySelector('tr[data-id="' + tier.id + '"]');
      if (!tr) {
        tr = rowTemplate();
        tr.dataset.id = tier.id;
      }
      body.appendChild(tr);
      const row = result.rows[index];
      const price = tr.querySelector(".price");
      const qty = tr.querySelector(".qty");
      if (document.activeElement !== price && price.value !== tier.price) price.value = tier.price;
      const qtyShown = state.equalQty ? (row && !row.invalidReason ? row.qtyText : "") : tier.qty;
      if (document.activeElement !== qty && qty.value !== qtyShown) qty.value = qtyShown;
      tr.classList.toggle("is-ignored", !!(row && row.invalidReason));
      tr.querySelector(".loss").textContent = row && row.lossText ? row.lossText : "—";
      tr.querySelector(".notional").textContent = row && row.notionalText ? row.notionalText : "—";
      tr.querySelector(".margin").textContent = row && row.marginText ? row.marginText : "—";
      tr.querySelector(".tag").textContent = rowTag(row);
      tr.querySelector(".x").disabled = state.tiers.length <= 1;
    });
  }

  function paintPartials(result) {
    const body = $("partial-body");
    body.replaceChildren();
    if (!result.partials.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="4">—</td>';
      body.appendChild(tr);
      return;
    }
    result.partials.forEach((item) => {
      const tr = document.createElement("tr");
      [item.order, item.priceText, item.cumLossText, item.remaining].forEach((value) => {
        const td = document.createElement("td");
        td.textContent = String(value);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function paintChrome() {
    const side = state.direction === "short" ? "short" : "long";
    $("direction").closest(".field").dataset.side = side;
    const count = String(state.tiers.length);
    $("tier-count-num").textContent = count;
    const range = $("tier-count");
    if (document.activeElement !== range) range.value = count;
  }

  function setTierCount(target) {
    const count = Math.min(12, Math.max(1, target));
    let next = state;
    while (next.tiers.length < count) next = C.addTier(next);
    while (next.tiers.length > count) next = C.removeTier(next, next.tiers.length - 1);
    state = next;
    render();
  }

  function render() {
    setStatus();
    paintChrome();
    $("step-info").textContent = stepFact();
    $("custom-fields").hidden = state.symbol !== "CUSTOM";
    const result = current();
    paintMessages(result);
    paintSummary(result);
    paintTiers(result);
    paintPartials(result);
  }

  function applyLoaded(next) {
    const previous = C.resolveProduct(state);
    state = next;
    syncControls();
    render();
    if (C.resolveProduct(state) !== previous) refreshRef();
  }

  function setRef(price, tag, status) {
    $("ref-price").textContent = price;
    $("ref-tag").textContent = tag;
    $("ref-box").dataset.status = status;
  }

  async function refreshRef() {
    const seq = ++refSeq;
    const product = C.resolveProduct(state);
    if (!product) {
      setRef("—", "无", "none");
      return;
    }
    setRef("…", "", "loading");
    try {
      const url = "https://api.bitget.com/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=" + encodeURIComponent(product);
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json();
      if (seq !== refSeq) return;
      const row = Array.isArray(body.data) ? body.data[0] : body.data;
      const last = row && row.lastPr;
      if (!last) throw new Error("empty");
      setRef(String(last), "实时", "live");
    } catch (err) {
      if (seq !== refSeq) return;
      const snap = C.snapshotPrice(state.symbol);
      if (snap) setRef(snap, "快照", "snapshot");
      else setRef("—", "无", "none");
    }
  }

  function bind() {
    $("symbol").addEventListener("change", () => {
      state.symbol = $("symbol").value;
      render();
      refreshRef();
    });
    $("custom-symbol").addEventListener("input", () => {
      state.customSymbol = $("custom-symbol").value;
      clearTimeout(customTimer);
      customTimer = setTimeout(refreshRef, 400);
    });
    $("custom-step").addEventListener("input", () => {
      state.customStep = $("custom-step").value;
      render();
    });
    ["stop-loss", "loss-cap"].forEach((id) => {
      const key = id === "stop-loss" ? "stopLoss" : "lossCap";
      $(id).addEventListener("input", () => {
        state[key] = $(id).value;
        render();
      });
    });
    $("leverage").addEventListener("change", () => {
      state.leverage = $("leverage").value;
      render();
    });
    $("direction").addEventListener("change", () => {
      state.direction = $("direction").value === "short" ? "short" : "long";
      render();
    });
    $("tier-count").addEventListener("input", () => {
      setTierCount(Number($("tier-count").value));
    });
    $("load-300").addEventListener("click", () => applyLoaded(C.loadSample("cap300")));
    $("load-500").addEventListener("click", () => applyLoaded(C.loadSample("cap500")));
    $("restore-equal").addEventListener("click", () => {
      state = C.restoreEqual(state);
      render();
    });
    $("ref-refresh").addEventListener("click", refreshRef);
    $("tier-body").addEventListener("input", (event) => {
      const tr = event.target.closest("tr");
      if (!tr) return;
      const index = state.tiers.findIndex((tier) => tier.id === tr.dataset.id);
      if (index < 0) return;
      if (event.target.classList.contains("price")) state = C.applyPriceEdit(state, index, event.target.value);
      if (event.target.classList.contains("qty")) state = C.applyQtyEdit(state, index, event.target.value);
      render();
    });
    $("tier-body").addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove]");
      if (!button || button.disabled || state.tiers.length <= 1) return;
      const tr = button.closest("tr");
      const index = state.tiers.findIndex((tier) => tier.id === tr.dataset.id);
      if (index < 0) return;
      state = C.removeTier(state, index);
      render();
    });
  }

  initSymbols();
  syncControls();
  bind();
  render();
  refreshRef();
})();
