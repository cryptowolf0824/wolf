/* 以额定损仓位计算器 — pure math, no IO.
   Decimal math uses BigInt at SCALE so step rounding is exact. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.PositionCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SCALE = 18;
  const SCALE_BI = 10n ** BigInt(SCALE);

  const SYMBOLS = [
    { id: "BTC", step: "0.0001", product: "BTCUSDT" },
    { id: "ETH", step: "0.01", product: "ETHUSDT" },
    { id: "LINK", step: "1", product: "LINKUSDT" },
    { id: "HYPE", step: "0.01", product: "HYPEUSDT" },
    { id: "PEPE", step: "1000", product: "PEPEUSDT" },
    { id: "WIF", step: "0.1", product: "WIFUSDT" },
    { id: "DOGE", step: "1", product: "DOGEUSDT" },
    { id: "AAVE", step: "0.1", product: "AAVEUSDT" },
    { id: "SUI", step: "0.1", product: "SUIUSDT" },
  ];

  const SNAPSHOT = {
    label: "Bitget USDT-M 快照 · 2026-11-25 00:03 北京时间",
    prices: {
      BTC: "59600.1",
      ETH: "1673.76",
      LINK: "8.753",
      DOGE: "0.05453",
      AAVE: "93.59",
      SUI: "0.6393",
      PEPE: "0.0000033301",
      WIF: "0.1192",
      HYPE: "61.138",
    },
  };

  const SAMPLES = {
    cap300: {
      symbol: "HYPE",
      direction: "long",
      stopLoss: "54.5",
      lossCap: "300",
      leverage: "10",
      tiers: [{ price: "60.5" }, { price: "58" }, { price: "56" }],
    },
    cap500: {
      symbol: "HYPE",
      direction: "long",
      stopLoss: "54.5",
      lossCap: "500",
      leverage: "10",
      tiers: [{ price: "60.5" }, { price: "58" }, { price: "56" }],
    },
  };

  let idSeq = 1;
  function newId() {
    idSeq += 1;
    return "t" + idSeq;
  }

  function plainFromNumber(n) {
    if (!Number.isFinite(n)) return "";
    let s = n.toFixed(SCALE);
    if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s;
  }

  function parseDecimal(input) {
    if (input === null || input === undefined) return null;
    let s = typeof input === "number" ? plainFromNumber(input) : String(input).trim();
    if (!s) return null;
    s = s.replace(/[,，\s]/g, "");
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)[eE][+-]?\d+$/.test(s)) {
      const n = Number(s);
      if (!Number.isFinite(n)) return null;
      s = plainFromNumber(n);
    }
    const m = s.match(/^([+-])?(\d+)?(?:\.(\d+))?$/);
    if (!m || (m[2] === undefined && m[3] === undefined)) return null;
    const neg = m[1] === "-";
    let ints = m[2] || "0";
    let frac = m[3] || "";
    ints = ints.replace(/^0+(?=\d)/, "") || "0";
    if (ints.length > 24) return null;
    let bi;
    if (frac.length > SCALE) {
      const roundUp = frac[SCALE] >= "5";
      frac = frac.slice(0, SCALE);
      bi = BigInt(ints) * SCALE_BI + BigInt(frac.padEnd(SCALE, "0"));
      if (roundUp) bi += 1n;
    } else {
      bi = BigInt(ints) * SCALE_BI + BigInt(frac.padEnd(SCALE, "0"));
    }
    return neg ? -bi : bi;
  }

  function formatScaled(bi, opts) {
    if (bi === null || bi === undefined) return "";
    const dp = opts && Object.prototype.hasOwnProperty.call(opts, "dp") ? opts.dp : null;
    const trim = !opts || opts.trim !== false;
    const neg = bi < 0n;
    let v = neg ? -bi : bi;
    let body;
    if (dp === null) {
      const ints = v / SCALE_BI;
      let frac = (v % SCALE_BI).toString().padStart(SCALE, "0").replace(/0+$/, "");
      body = frac ? ints.toString() + "." + frac : ints.toString();
    } else {
      const places = Number(dp);
      const factor = 10n ** BigInt(SCALE - places);
      const rounded = (v + factor / 2n) / factor;
      const base = 10n ** BigInt(places);
      const ints = places === 0 ? rounded : rounded / base;
      let frac = places === 0 ? "" : (rounded % base).toString().padStart(places, "0");
      if (trim && frac) frac = frac.replace(/0+$/, "");
      body = frac ? ints.toString() + "." + frac : ints.toString();
    }
    if (neg && body !== "0") return "-" + body;
    return body;
  }

  function formatTrim(bi) {
    return formatScaled(bi, { dp: null, trim: true });
  }

  function formatFixed(bi, dp) {
    return formatScaled(bi, { dp: dp, trim: false });
  }

  function divRound(numer, denom) {
    if (denom === 0n) return null;
    let n = numer;
    let d = denom;
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    if (n >= 0n) return (n + d / 2n) / d;
    return -((-n + d / 2n) / d);
  }

  function mulRound(a, b) {
    const neg = (a < 0n) !== (b < 0n);
    const prod = (a < 0n ? -a : a) * (b < 0n ? -b : b);
    const q = (prod + SCALE_BI / 2n) / SCALE_BI;
    return neg ? -q : q;
  }

  function stepDecimalsFromScaled(step) {
    const text = formatTrim(step);
    const dot = text.indexOf(".");
    return dot === -1 ? 0 : text.length - dot - 1;
  }

  function describeStep(stepRaw) {
    const step = parseDecimal(stepRaw);
    if (step === null || step <= 0n) return "请填写大于 0 的数量步长";
    const text = formatTrim(step);
    const dp = stepDecimalsFromScaled(step);
    const kind = dp === 0 ? "整数" : dp + " 位小数";
    return "数量步长 " + text + "（" + kind + "）";
  }

  function withinCap(qty, sumRisk, cap) {
    return qty * sumRisk <= cap * SCALE_BI;
  }

  function fitQty(cap, sumRisk, step) {
    if (cap === null || sumRisk === null || step === null) {
      return { qty: 0n, mode: "none", raw: null };
    }
    if (cap <= 0n || sumRisk <= 0n || step <= 0n) {
      return { qty: 0n, mode: "none", raw: null };
    }
    const raw = divRound(cap * SCALE_BI, sumRisk);
    const denom = sumRisk * step;
    const numer = cap * SCALE_BI;
    const unitsNearest = divRound(numer, denom);
    const qtyNearest = unitsNearest * step;
    if (unitsNearest > 0n && withinCap(qtyNearest, sumRisk, cap)) {
      return { qty: qtyNearest, mode: "nearest", raw: raw };
    }
    if (unitsNearest <= 0n) {
      return { qty: 0n, mode: "zero-exceeds", raw: raw };
    }
    const unitsFloor = numer / denom;
    const qtyFloor = unitsFloor * step;
    if (unitsFloor > 0n && withinCap(qtyFloor, sumRisk, cap)) {
      return { qty: qtyFloor, mode: "floor", raw: raw };
    }
    return { qty: 0n, mode: "zero-exceeds", raw: raw };
  }

  function emptyTotals() {
    return {
      totalQtyText: "0",
      avgPriceText: "",
      totalLossText: "0",
      totalLossFixed2: "0.00",
      totalMarginText: "",
      totalMarginFixed2: "",
      totalNotionalText: "0",
    };
  }

  function compute(input) {
    const direction = input && input.direction === "short" ? "short" : "long";
    const equalQty = !input || input.equalQty !== false;
    const stop = parseDecimal(input ? input.stopLoss : null);
    const cap = parseDecimal(input ? input.lossCap : null);
    const lev = parseDecimal(input ? input.leverage : null);
    const step = parseDecimal(input ? input.step : null);
    const errors = [];
    const warnings = [];
    const notes = [];

    if (stop === null || stop <= 0n) errors.push("请填写大于 0 的止损价。");
    if (cap === null || cap <= 0n) errors.push("请填写大于 0 的额定亏损（U）。");
    if (step === null || step <= 0n) errors.push("数量步长必须大于 0。");
    if (lev === null || lev <= 0n) errors.push("请填写大于 0 的杠杆。杠杆只用于估算保证金，不影响数量。");

    const stopOk = stop !== null && stop > 0n;
    const sourceTiers = input && Array.isArray(input.tiers) ? input.tiers : [];
    const draft = sourceTiers.map((tier, index) => {
      const price = parseDecimal(tier && tier.price);
      const qtyInput = parseDecimal(tier && tier.qty);
      let invalidReason = null;
      let risk = null;
      if (price === null) {
        invalidReason = tier && String(tier.price || "").trim() ? "开仓价不是有效数字" : "请填写开仓价";
      } else if (price <= 0n) {
        invalidReason = "开仓价需大于 0";
      } else if (!stopOk) {
        invalidReason = "请填写止损";
      } else {
        risk = direction === "long" ? price - stop : stop - price;
        if (risk <= 0n) {
          invalidReason = direction === "long"
            ? "多单每档开仓价须高于止损"
            : "空单每档开仓价须低于止损";
          risk = null;
        }
      }
      return { index, price, qtyInput, invalidReason, risk };
    });

    let sumRisk = 0n;
    draft.forEach((row) => {
      if (row.risk !== null) sumRisk += row.risk;
    });

    const canFit = errors.filter((msg) => !msg.startsWith("请填写大于 0 的杠杆")).length === 0
      && stopOk
      && cap !== null
      && cap > 0n
      && step !== null
      && step > 0n
      && sumRisk > 0n;
    const fit = canFit ? fitQty(cap, sumRisk, step) : { qty: 0n, mode: "none", raw: null };
    const stepDp = step !== null && step > 0n ? stepDecimalsFromScaled(step) : 0;

    if (stopOk && cap !== null && cap > 0n && draft.length > 0 && draft.every((row) => row.invalidReason)) {
      warnings.push("没有有效档位。开仓价要在止损的正确一侧，无效档不参与数量和亏损。");
    }
    if (fit.mode === "zero-exceeds") {
      warnings.push("即使只下一个数量步长，止损亏损也会超过额定亏损，数量已记为 0。");
    }
    if (fit.mode === "floor") {
      notes.push("就近取整会超过额定亏损，已按数量步长向下取整。");
    }

    const rows = draft.map((row) => {
      let qty = 0n;
      let offStep = false;
      let qtyWarning = "";
      if (!row.invalidReason) {
        if (equalQty) {
          qty = fit.qty;
        } else if (row.qtyInput === null) {
          const rawQty = sourceTiers[row.index] && sourceTiers[row.index].qty;
          if (rawQty !== undefined && String(rawQty).trim() !== "") {
            qtyWarning = "数量不是有效数字，本档按 0 计算";
          }
          qty = 0n;
        } else if (row.qtyInput < 0n) {
          qtyWarning = "数量不能为负，本档按 0 计算";
          qty = 0n;
        } else {
          qty = row.qtyInput;
          if (step !== null && step > 0n && qty % step !== 0n) {
            offStep = true;
            qtyWarning = "数量不是步长的整数倍，仍按你输入的数量计算";
          }
        }
      }
      const loss = row.risk !== null ? mulRound(qty, row.risk) : 0n;
      const notional = row.price !== null && qty > 0n ? mulRound(qty, row.price) : 0n;
      const margin = lev !== null && lev > 0n && notional > 0n ? divRound(notional * SCALE_BI, lev) : null;
      const included = !row.invalidReason && qty > 0n;
      return {
        index: row.index,
        invalidReason: row.invalidReason,
        included,
        offStep,
        qtyWarning,
        priceScaled: row.price,
        qtyScaled: qty,
        riskScaled: row.risk,
        lossScaled: loss,
        notionalScaled: notional,
        marginScaled: margin,
        priceText: row.price !== null ? formatTrim(row.price) : "",
        qtyText: !row.invalidReason && (equalQty || qty > 0n || (sourceTiers[row.index] && String(sourceTiers[row.index].qty || "").trim() !== ""))
          ? (step !== null && step > 0n && (equalQty || qty % step === 0n) ? formatFixed(qty, stepDp) : formatTrim(qty))
          : "",
        riskText: row.risk !== null ? formatTrim(row.risk) : "",
        lossText: included ? formatTrim(loss) : "",
        notionalText: included ? formatTrim(notional) : "",
        marginText: included && margin !== null ? formatTrim(margin) : "",
      };
    });

    if (!equalQty && rows.some((row) => row.offStep)) {
      warnings.push("有档位数量不是步长的整数倍，汇总仍按你输入的数量计算，不会偷偷改回等量。");
    }

    let totalQty = 0n;
    let totalLoss = 0n;
    let totalNotional = 0n;
    rows.forEach((row) => {
      if (!row.invalidReason) totalQty += row.qtyScaled;
      if (row.included) {
        totalLoss += row.lossScaled;
        totalNotional += row.notionalScaled;
      }
    });
    const totalMargin = lev !== null && lev > 0n && totalNotional > 0n
      ? divRound(totalNotional * SCALE_BI, lev)
      : null;
    const avg = totalQty > 0n ? divRound(totalNotional * SCALE_BI, totalQty) : null;

    const fillRows = rows
      .map((row, index) => ({ row, index }))
      .filter((item) => item.row.included)
      .sort((a, b) => {
        if (a.row.priceScaled === b.row.priceScaled) return a.index - b.index;
        if (direction === "long") return a.row.priceScaled > b.row.priceScaled ? -1 : 1;
        return a.row.priceScaled < b.row.priceScaled ? -1 : 1;
      });

    let cumLoss = 0n;
    let cumQty = 0n;
    const partials = fillRows.map((item, order) => {
      cumLoss += item.row.lossScaled;
      cumQty += item.row.qtyScaled;
      const remaining = fillRows.length - order - 1;
      return {
        order: order + 1,
        priceText: item.row.priceText,
        qtyText: item.row.qtyText,
        cumQtyText: formatTrim(cumQty),
        cumLossText: formatTrim(cumLoss),
        remaining,
        label: remaining === 0
          ? "全部 " + fillRows.length + " 档已成交"
          : "成交前 " + (order + 1) + " 档后，尚有 " + remaining + " 档未成交",
      };
    });

    const validRisks = rows.filter((row) => row.riskText).map((row) => row.riskText);
    let formulaText = "";
    if (canFit && validRisks.length) {
      const side = direction === "long" ? "做多：每档数量 = 额定亏损 ÷ Σ(开仓价 − 止损)" : "做空：每档数量 = 额定亏损 ÷ Σ(止损 − 开仓价)";
      const rawText = fit.raw !== null ? formatScaled(fit.raw, { dp: 8, trim: true }) : "";
      const qtyText = formatFixed(fit.qty, stepDp);
      const sumText = formatTrim(sumRisk);
      let rounded = "按步长 " + formatTrim(step) + " 就近取整为 " + qtyText + "。";
      if (fit.mode === "floor") {
        rounded = "按步长 " + formatTrim(step) + " 就近取整会超过额定亏损，因此向下取整为 " + qtyText + "。";
      } else if (fit.mode === "zero-exceeds") {
        rounded = "按步长 " + formatTrim(step) + " 取整后，1 步也会超过额定亏损，数量为 0。";
      }
      formulaText = side + " = " + formatTrim(cap) + " ÷ (" + validRisks.join(" + ") + ") = " + formatTrim(cap) + " ÷ " + sumText + " ≈ " + rawText + "，" + rounded;
      if (fit.qty > 0n) {
        formulaText += " " + qtyText + " × " + sumText + " = " + formatTrim(mulRound(fit.qty, sumRisk)) + " U。";
      }
    } else if (!equalQty) {
      formulaText = "已打破等量，下面的汇总使用各档实际数量。";
    }
    if (!equalQty && canFit) {
      notes.push("已打破等量。恢复等量后，每个有效档约为 " + formatFixed(fit.qty, stepDp) + "。");
    }

    const totals = totalQty > 0n ? {
      totalQtyText: formatTrim(totalQty),
      avgPriceText: avg !== null ? formatScaled(avg, { dp: 6, trim: true }) : "",
      totalLossText: formatTrim(totalLoss),
      totalLossFixed2: formatFixed(totalLoss, 2),
      totalMarginText: totalMargin !== null ? formatTrim(totalMargin) : "",
      totalMarginFixed2: totalMargin !== null ? formatFixed(totalMargin, 2) : "",
      totalNotionalText: formatTrim(totalNotional),
    } : emptyTotals();

    return {
      direction,
      equalQty,
      fitMode: fit.mode,
      errors,
      warnings,
      notes,
      formulaText,
      sumRiskText: sumRisk > 0n ? formatTrim(sumRisk) : "",
      rawQtyText: fit.raw !== null ? formatScaled(fit.raw, { dp: 8, trim: true }) : "",
      qtyEachText: canFit ? formatFixed(fit.qty, stepDp) : "",
      validCount: rows.filter((row) => !row.invalidReason).length,
      ignoredCount: rows.filter((row) => row.invalidReason).length,
      rows,
      partials,
      fillOrderText: direction === "long" ? "做多假设价格从高到低成交" : "做空假设价格从低到高成交",
      ...totals,
    };
  }

  function equallySpaced(count, highRaw, lowRaw) {
    const n = Number(String(count).trim());
    if (!Number.isInteger(n) || n < 1) return { error: "档数需为大于 0 的整数。", prices: [] };
    if (n > 50) return { error: "档数最多 50。", prices: [] };
    const high = parseDecimal(highRaw);
    const low = parseDecimal(lowRaw);
    if (high === null || low === null || high <= 0n || low <= 0n) {
      return { error: "最高价和最低价都需为大于 0 的数字。", prices: [] };
    }
    if (n === 1) return { error: null, prices: [high], priceTexts: [formatScaled(high, { dp: 8, trim: true })] };
    const den = BigInt(n - 1);
    const prices = [];
    const priceTexts = [];
    for (let i = 0; i < n; i += 1) {
      const numer = high * BigInt(n - 1 - i) + low * BigInt(i);
      const price = divRound(numer, den);
      prices.push(price);
      priceTexts.push(formatScaled(price, { dp: 8, trim: true }));
    }
    return { error: null, prices, priceTexts };
  }

  function cloneState(state) {
    return {
      symbol: state.symbol,
      customSymbol: state.customSymbol || "",
      customStep: state.customStep || "",
      direction: state.direction,
      stopLoss: state.stopLoss,
      lossCap: state.lossCap,
      leverage: state.leverage,
      equalQty: state.equalQty !== false,
      tiers: (state.tiers || []).map((tier) => ({
        id: tier.id,
        price: tier.price,
        qty: tier.qty || "",
      })),
    };
  }

  function loadSample(which) {
    const sample = SAMPLES[which] || SAMPLES.cap300;
    return {
      symbol: sample.symbol,
      customSymbol: "",
      customStep: "",
      direction: sample.direction,
      stopLoss: sample.stopLoss,
      lossCap: sample.lossCap,
      leverage: sample.leverage,
      equalQty: true,
      tiers: sample.tiers.map((tier) => ({ id: newId(), price: tier.price, qty: "" })),
    };
  }

  function resolveStep(state) {
    if (!state || state.symbol === "CUSTOM") return state ? state.customStep : "";
    const found = SYMBOLS.find((item) => item.id === state.symbol);
    return found ? found.step : "";
  }

  function resolveProduct(state) {
    if (!state) return "";
    if (state.symbol === "CUSTOM") {
      const raw = String(state.customSymbol || "").trim().toUpperCase().replace(/\s+/g, "");
      if (!raw) return "";
      return raw.endsWith("USDT") ? raw : raw + "USDT";
    }
    const found = SYMBOLS.find((item) => item.id === state.symbol);
    return found ? found.product : "";
  }

  function stateToInput(state, step) {
    return {
      direction: state.direction,
      stopLoss: state.stopLoss,
      lossCap: state.lossCap,
      leverage: state.leverage,
      step: step,
      equalQty: state.equalQty !== false,
      tiers: (state.tiers || []).map((tier) => ({ price: tier.price, qty: tier.qty })),
    };
  }

  function applyPriceEdit(state, index, priceStr) {
    const next = cloneState(state);
    if (!next.tiers[index]) return next;
    next.tiers[index].price = priceStr;
    return next;
  }

  function applyQtyEdit(state, index, qtyStr) {
    const next = cloneState(state);
    if (!next.tiers[index]) return next;
    if (next.equalQty) {
      const result = compute(stateToInput(state, resolveStep(state)));
      next.tiers = next.tiers.map((tier, i) => ({
        id: tier.id,
        price: tier.price,
        qty: result.rows[i] && !result.rows[i].invalidReason ? result.rows[i].qtyText : tier.qty,
      }));
      next.equalQty = false;
    }
    next.tiers[index].qty = qtyStr;
    return next;
  }

  function restoreEqual(state) {
    const next = cloneState(state);
    next.equalQty = true;
    return next;
  }

  function clearTierPrices(state) {
    const next = cloneState(state);
    next.equalQty = true;
    next.tiers = next.tiers.map((tier) => ({ id: tier.id, price: "", qty: "" }));
    return next;
  }

  function addTier(state) {
    const next = cloneState(state);
    if (next.tiers.length >= 50) return next;
    next.tiers.push({ id: newId(), price: "", qty: "" });
    return next;
  }

  function removeTier(state, index) {
    const next = cloneState(state);
    next.tiers = next.tiers.filter((_, i) => i !== index);
    return next;
  }

  function generateEqualTiers(state, count, high, low) {
    const spaced = equallySpaced(count, high, low);
    if (spaced.error) return { state: state, error: spaced.error };
    const next = cloneState(state);
    next.equalQty = true;
    next.tiers = spaced.priceTexts.map((price) => ({ id: newId(), price: price, qty: "" }));
    let note = null;
    const highN = parseDecimal(high);
    const lowN = parseDecimal(low);
    if (highN !== null && lowN !== null && lowN > highN) {
      note = "最低价高于最高价，仍按这两个端点从最高价字段排到最低价字段。";
    }
    return { state: next, error: null, note: note };
  }

  function snapshotPrice(symbol) {
    return Object.prototype.hasOwnProperty.call(SNAPSHOT.prices, symbol) ? SNAPSHOT.prices[symbol] : "";
  }

  function contractName(state) {
    if (!state || !state.symbol) return "";
    if (state.symbol === "CUSTOM") return String(state.customSymbol || "").trim();
    const found = SYMBOLS.find((item) => item.id === state.symbol);
    return found ? found.product : "";
  }

  function planBlockKind(state, result) {
    const contract = contractName(state);
    const step = parseDecimal(resolveStep(state));
    if (!contract || step === null || step <= 0n) return "symbol";
    const directionOk = state.direction === "long" || state.direction === "short";
    const tiers = Array.isArray(state.tiers) ? state.tiers : [];
    const pricesOk = tiers.length > 0
      && result.rows.length === tiers.length
      && result.rows.every((row) => !row.invalidReason);
    const stopOrCapError = result.errors.some((msg) => msg.includes("止损") || msg.includes("额定亏损"));
    if (!directionOk || !pricesOk || stopOrCapError) return "inputs";
    if (result.errors.some((msg) => msg.includes("杠杆"))) return "leverage";
    if (result.errors.length) return "result";
    const rowsOk = result.rows.every((row) => row.included
      && row.qtyScaled > 0n
      && row.priceText
      && row.qtyText
      && row.marginText
      && row.riskText
      && row.lossText
      && row.notionalText);
    const totalsOk = result.totalQtyText && result.totalQtyText !== "0"
      && result.totalLossText && result.totalLossText !== "0"
      && result.totalMarginText
      && result.totalMarginFixed2
      && result.avgPriceText
      && result.totalNotionalText && result.totalNotionalText !== "0"
      && result.partials.length === tiers.length;
    if (!rowsOk || !totalsOk) return "result";
    return "";
  }

  function planBlockReason(kind) {
    if (kind === "symbol") return "请先填写合约和数量步长";
    if (kind === "leverage") return "请先填写有效杠杆";
    if (kind === "inputs") return "请先填好止损、额定亏和每一档开仓价";
    return "当前结果无法生成完整开仓计划";
  }

  function chineseOrdinal(n) {
    const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
    const value = Number(n);
    if (!Number.isInteger(value) || value <= 0) return String(n);
    if (value < 10) return digits[value];
    if (value === 10) return "十";
    if (value < 20) return "十" + digits[value - 10];
    if (value < 100) {
      const tens = Math.floor(value / 10);
      const ones = value % 10;
      return digits[tens] + "十" + (ones ? digits[ones] : "");
    }
    return String(value);
  }

  function fillCountPhrase(n) {
    if (n === 2) return "两";
    return chineseOrdinal(n);
  }

  function enteredPrice(raw) {
    const parsed = parseDecimal(raw);
    if (parsed === null || parsed <= 0n) return "无";
    return formatTrim(parsed);
  }

  function copiedLoss(text) {
    const parsed = parseDecimal(text);
    if (parsed === null) return String(text == null ? "" : text);
    return formatScaled(parsed, { dp: 8, trim: true });
  }

  function copiedAvg(text) {
    const parsed = parseDecimal(text);
    if (parsed === null) return String(text == null ? "" : text);
    return formatFixed(parsed, 2);
  }

  function renderPlan(state, result) {
    const side = state.direction === "short" ? "空" : "多";
    const rows = result.rows.filter((row) => !row.invalidReason && row.included);
    const phrase = fillCountPhrase(rows.length) + "档成交后";
    const lines = [
      "开仓计划：",
      "标的 " + contractName(state),
      "开仓方向：" + side,
      "杠杆：" + formatTrim(parseDecimal(state.leverage)) + "×",
      "开仓方式：限价挂单",
    ];
    rows.forEach((row, index) => {
      lines.push("档位" + chineseOrdinal(index + 1) + "：" + row.priceText + "，数量 " + row.qtyText);
    });
    lines.push(
      "统一挂止损：" + enteredPrice(state.stopLoss),
      "统一挂止盈：无",
      phrase + "预计亏损：" + copiedLoss(result.totalLossText) + " U",
      phrase + "平均成本价：" + copiedAvg(result.avgPriceText),
      "总保证金：" + result.totalMarginFixed2 + " U",
      "",
      "开仓前请再次核对此计划如果全部成交是否符合该计划标准，误差不应超过3%"
    );
    return lines.join("\n");
  }

  function buildOpenPlan(input) {
    const state = input || {};
    const result = compute(stateToInput(state, resolveStep(state)));
    const kind = planBlockKind(state, result);
    if (kind) return { ok: false, reason: planBlockReason(kind) };
    return { ok: true, text: renderPlan(state, result) };
  }

  return {
    SCALE,
    SYMBOLS,
    SNAPSHOT,
    SAMPLES,
    parseDecimal,
    formatTrim,
    formatFixed,
    formatScaled,
    describeStep,
    fitQty,
    compute,
    equallySpaced,
    loadSample,
    resolveStep,
    resolveProduct,
    stateToInput,
    applyPriceEdit,
    applyQtyEdit,
    restoreEqual,
    clearTierPrices,
    addTier,
    removeTier,
    generateEqualTiers,
    snapshotPrice,
    buildOpenPlan,
  };
});
