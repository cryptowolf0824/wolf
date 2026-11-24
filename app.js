(function () {
  const C = window.PositionCalc;
  let state = initialState();
  let refSeq = 0;
  let customTimer = 0;
  let priceSymbolKey = symbolKey();

  const $ = (id) => document.getElementById(id);

  function initialState() {
    let next = {
      symbol: "HYPE",
      customSymbol: "",
      customStep: "",
      direction: "long",
      stopLoss: "",
      lossCap: "",
      leverage: "10",
      equalQty: true,
      tiers: [],
    };
    next = C.addTier(next);
    next = C.addTier(next);
    next = C.addTier(next);
    return next;
  }

  function symbolKey() {
    if (state.symbol === "CUSTOM") {
      return "CUSTOM:" + String(state.customSymbol || "").trim().toUpperCase();
    }
    return state.symbol;
  }

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

  function adoptSymbolChange() {
    const key = symbolKey();
    if (key === priceSymbolKey) return;
    state = C.clearTierPrices(state);
    priceSymbolKey = key;
  }

  function rowHint(row) {
    if (!row) return "";
    const reason = row.invalidReason || "";
    if (!reason) return row.offStep ? "数量未对齐步长" : "";
    if (reason.indexOf("开仓价") >= 0 && reason.indexOf("止损") < 0) return reason.indexOf("数字") >= 0 ? "开仓价无效" : "请填写开仓价";
    if (reason.indexOf("高于止损") >= 0) return "多单每档开仓价须高于止损";
    if (reason.indexOf("低于止损") >= 0) return "空单每档开仓价须低于止损";
    if (reason.indexOf("止损") >= 0) return "请填写止损";
    if (reason.indexOf("大于 0") >= 0) return "开仓价需大于 0";
    return reason;
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
    const longOn = state.direction !== "short";
    $("dir-long").setAttribute("aria-pressed", longOn ? "true" : "false");
    $("dir-short").setAttribute("aria-pressed", longOn ? "false" : "true");
    $("custom-fields").hidden = state.symbol !== "CUSTOM";
    paintCount();
  }

  function stepFact() {
    const parsed = C.parseDecimal(step());
    if (parsed === null || parsed <= 0n) return "步长 —";
    return "步长 " + C.formatTrim(parsed);
  }

  function paintCount() {
    const count = String(state.tiers.length || 1);
    $("tier-count-num").textContent = count;
    const range = $("tier-count");
    if (document.activeElement !== range) range.value = count;
  }

  function paintMessages(result) {
    const box = $("message-list");
    box.replaceChildren();
    const anyPrice = state.tiers.some((tier) => String(tier.price || "").trim());
    const texts = [];
    if (anyPrice && result.errors.some((msg) => msg.indexOf("止损价") >= 0)) texts.push("请填写止损");
    if (anyPrice && result.errors.some((msg) => msg.indexOf("额定亏损") >= 0)) texts.push("请填写额定亏");
    if (result.errors.some((msg) => msg.indexOf("步长") >= 0)) texts.push("步长需 > 0");
    if (result.warnings.some((msg) => msg.indexOf("数量已记为 0") >= 0)) texts.push("一步即超限，数量为 0");
    if (result.fitMode === "floor") texts.push("已向下取整");
    if (result.warnings.some((msg) => msg.indexOf("整数倍") >= 0)) texts.push("数量未对齐步长");
    texts.forEach((text) => {
      const chip = document.createElement("span");
      chip.className = "chip-warn";
      chip.textContent = text;
      box.appendChild(chip);
    });
  }

  function paintSummary(result) {
    const qty = result.totalQtyText && result.totalQtyText !== "0" ? result.totalQtyText : "0";
    $("total-qty").textContent = qty;
    $("avg-price").textContent = result.avgPriceText || "—";
    $("total-loss").textContent = result.totalLossText && result.totalLossText !== "0" ? result.totalLossText : "—";
    $("total-margin").textContent = result.totalMarginFixed2 || "—";
    $("total-notional").textContent = result.totalNotionalText && result.totalNotionalText !== "0" ? result.totalNotionalText : "—";
    const exact = $("margin-exact");
    exact.textContent = result.totalMarginText && result.totalMarginText !== result.totalMarginFixed2
      ? result.totalMarginText
      : "";
    const loss = result.totalLossText && result.totalLossText !== "0" ? result.totalLossText + " U" : "—";
    $("loss-sub").textContent = "全部成交亏损 " + loss;
    $("fill-dir").textContent = state.direction === "long" ? "高→低" : "低→高";
    $("step-info").textContent = stepFact();
  }

  function tierNode(id) {
    const node = document.createElement("article");
    node.className = "tier";
    node.dataset.id = id;
    node.innerHTML = [
      '<div class="tier-top"><span class="idx"></span><button type="button" class="x" data-remove="1" aria-label="删除档位">×</button></div>',
      '<div class="field"><label>开仓价</label><div class="input"><input class="price" type="text" inputmode="decimal" autocomplete="off" aria-label="开仓价"><span class="unit">USDT</span></div></div>',
      '<div class="field"><label>数量</label><div class="input"><input class="qty" type="text" inputmode="decimal" autocomplete="off" aria-label="数量"></div></div>',
      '<div class="mini"><span>亏损<b class="loss">—</b></span><span>名义<b class="notional">—</b></span><span>保证金<b class="margin">—</b></span></div>',
      '<p class="hint"></p>'
    ].join("");
    return node;
  }

  function paintTiers(result) {
    const list = $("tier-list");
    const ids = new Set(state.tiers.map((tier) => tier.id));
    list.querySelectorAll(".tier").forEach((node) => {
      if (!ids.has(node.dataset.id)) node.remove();
    });
    state.tiers.forEach((tier, index) => {
      let node = list.querySelector('.tier[data-id="' + tier.id + '"]');
      if (!node) {
        node = tierNode(tier.id);
        list.appendChild(node);
      }
      list.appendChild(node);
      const row = result.rows[index];
      node.querySelector(".idx").textContent = String(index + 1).padStart(2, "0");
      const price = node.querySelector(".price");
      const qty = node.querySelector(".qty");
      if (document.activeElement !== price && price.value !== tier.price) price.value = tier.price;
      const qtyShown = state.equalQty ? (row && !row.invalidReason ? row.qtyText : "") : tier.qty;
      if (document.activeElement !== qty && qty.value !== qtyShown) qty.value = qtyShown;
      node.classList.toggle("is-ignored", !!(row && row.invalidReason && String(tier.price || "").trim()));
      node.querySelector(".loss").textContent = row && row.lossText ? row.lossText : "—";
      node.querySelector(".notional").textContent = row && row.notionalText ? row.notionalText : "—";
      node.querySelector(".margin").textContent = row && row.marginText ? row.marginText : "—";
      node.querySelector(".hint").textContent = rowHint(row);
      node.querySelector(".x").disabled = state.tiers.length <= 1;
    });
  }

  function paintPartials(result) {
    const body = $("partial-body");
    body.replaceChildren();
    if (!result.partials.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.textContent = "—";
      tr.appendChild(td);
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

  function render() {
    setStatus();
    paintCount();
    $("custom-fields").hidden = state.symbol !== "CUSTOM";
    const result = current();
    paintMessages(result);
    paintSummary(result);
    paintTiers(result);
    paintPartials(result);
  }

  function setTierCount(target) {
    const count = Math.min(12, Math.max(1, target));
    let next = state;
    while (next.tiers.length < count) next = C.addTier(next);
    while (next.tiers.length > count) next = C.removeTier(next, next.tiers.length - 1);
    state = next;
    render();
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
      adoptSymbolChange();
      syncControls();
      render();
      refreshRef();
    });
    $("custom-symbol").addEventListener("input", () => {
      state.customSymbol = $("custom-symbol").value;
      clearTimeout(customTimer);
      customTimer = setTimeout(refreshRef, 400);
    });
    $("custom-symbol").addEventListener("change", () => {
      state.customSymbol = $("custom-symbol").value;
      adoptSymbolChange();
      render();
      refreshRef();
    });
    $("custom-step").addEventListener("input", () => {
      state.customStep = $("custom-step").value;
      render();
    });
    $("stop-loss").addEventListener("input", () => {
      state.stopLoss = $("stop-loss").value;
      render();
    });
    $("loss-cap").addEventListener("input", () => {
      state.lossCap = $("loss-cap").value;
      render();
    });
    $("leverage").addEventListener("change", () => {
      state.leverage = $("leverage").value;
      render();
    });
    document.querySelectorAll("[data-direction]").forEach((button) => {
      button.addEventListener("click", () => {
        state.direction = button.dataset.direction === "short" ? "short" : "long";
        $("dir-long").setAttribute("aria-pressed", state.direction === "long" ? "true" : "false");
        $("dir-short").setAttribute("aria-pressed", state.direction === "short" ? "true" : "false");
        render();
      });
    });
    $("tier-count").addEventListener("input", () => setTierCount(Number($("tier-count").value)));
    $("restore-equal").addEventListener("click", () => {
      state = C.restoreEqual(state);
      render();
    });
    $("ref-refresh").addEventListener("click", refreshRef);
    $("tier-list").addEventListener("input", (event) => {
      const node = event.target.closest(".tier");
      if (!node) return;
      const index = state.tiers.findIndex((tier) => tier.id === node.dataset.id);
      if (index < 0) return;
      if (event.target.classList.contains("price")) state = C.applyPriceEdit(state, index, event.target.value);
      if (event.target.classList.contains("qty")) state = C.applyQtyEdit(state, index, event.target.value);
      render();
    });
    $("tier-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove]");
      if (!button || button.disabled || state.tiers.length <= 1) return;
      const node = button.closest(".tier");
      const index = state.tiers.findIndex((tier) => tier.id === node.dataset.id);
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
