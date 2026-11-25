const fs = require("fs");
const path = require("path");
const calc = require("./calc.js");

let failed = 0;
function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    failed += 1;
    console.error("FAIL", msg, "\n  actual:  ", actual, "\n  expected:", expected);
  } else {
    console.log("OK  ", msg);
  }
}

function run(state) {
  return calc.compute(calc.stateToInput(state, calc.resolveStep(state)));
}

const s300 = calc.loadSample("cap300");
const r300 = run(s300);
assertEq(r300.equalQty, true, "300 equal mode");
assertEq(r300.sumRiskText, "11", "300 sum risk");
assertEq(r300.qtyEachText, "27.27", "300 qty each");
assertEq(r300.rows.map((row) => row.qtyText).join(","), "27.27,27.27,27.27", "300 tier qtys");
assertEq(r300.totalQtyText, "81.81", "300 total qty");
assertEq(r300.totalLossText, "299.97", "300 full-fill loss");
assertEq(r300.totalNotionalText, "4758.615", "300 notional");
assertEq(r300.totalMarginText, "475.8615", "300 margin exact");
assertEq(r300.totalMarginFixed2, "475.86", "300 margin 2dp");
assertEq(r300.avgPriceText, "58.166667", "300 average price");
assertEq(r300.rows.map((row) => row.lossText).join(","), "163.62,95.445,40.905", "300 tier losses");
assertEq(r300.rows.map((row) => row.marginText).join(","), "164.9835,158.166,152.712", "300 tier margins");
assertEq(r300.partials.map((row) => row.priceText).join(","), "60.5,58,56", "300 fill order high to low");
assertEq(r300.partials.map((row) => row.cumLossText).join(","), "163.62,259.065,299.97", "300 partial losses");
assertEq(r300.partials.map((row) => String(row.remaining)).join(","), "2,1,0", "300 remaining tiers");
assertEq(r300.fitMode, "nearest", "300 nearest fit");
assertEq(r300.errors.length, 0, "300 no errors");

const s500 = calc.loadSample("cap500");
const r500 = run(s500);
assertEq(r500.qtyEachText, "45.45", "500 qty each");
assertEq(r500.totalQtyText, "136.35", "500 total qty");
assertEq(r500.totalLossText, "499.95", "500 full-fill loss");
assertEq(r500.totalMarginText, "793.1025", "500 margin exact");
assertEq(r500.totalMarginFixed2, "793.10", "500 margin 2dp");
assertEq(r500.totalNotionalText, "7931.025", "500 notional");
assertEq(r500.partials.map((row) => row.cumLossText).join(","), "272.7,431.775,499.95", "500 partial losses");

const leverage = calc.loadSample("cap300");
leverage.leverage = "20";
const rLev = run(leverage);
assertEq(rLev.qtyEachText, "27.27", "leverage does not change qty");
assertEq(rLev.totalLossText, "299.97", "leverage does not change loss");
assertEq(rLev.totalMarginText, "237.93075", "20x margin is notional/20");

const invalid = calc.loadSample("cap300");
invalid.tiers.push({ id: "bad", price: "50", qty: "" });
const rInv = run(invalid);
assertEq(rInv.qtyEachText, "27.27", "invalid tier ignored for qty");
assertEq(rInv.totalLossText, "299.97", "invalid tier ignored for loss");
assertEq(rInv.ignoredCount, 1, "one ignored tier");
assertEq(rInv.rows[3].invalidReason.includes("高于止损"), true, "long invalid reason");

const floorState = calc.loadSample("cap300");
floorState.lossCap = "299.96";
const rFloor = run(floorState);
assertEq(rFloor.fitMode, "floor", "nearest over cap floors");
assertEq(rFloor.qtyEachText, "27.26", "floor qty");
assertEq(rFloor.totalLossText, "299.86", "floor loss stays under cap");

const zeroState = calc.loadSample("cap300");
zeroState.lossCap = "0.05";
const rZero = run(zeroState);
assertEq(rZero.qtyEachText, "0.00", "one step exceeds cap");
assertEq(rZero.fitMode, "zero-exceeds", "zero-exceeds mode");
assertEq(rZero.warnings.some((msg) => msg.includes("数量已记为 0")), true, "zero warning");

const boundary = calc.compute({
  direction: "long",
  stopLoss: "10",
  lossCap: "0.025",
  leverage: "10",
  step: "0.01",
  equalQty: true,
  tiers: [{ price: "11" }],
});
assertEq(boundary.fitMode, "floor", "half-step rounds up then floors");
assertEq(boundary.qtyEachText, "0.02", "floor to 0.02");
assertEq(boundary.totalLossText, "0.02", "0.02 loss within 0.025");

const btc = calc.compute({
  direction: "long",
  stopLoss: "100",
  lossCap: "1",
  leverage: "5",
  step: "0.0001",
  equalQty: true,
  tiers: [{ price: "103" }],
});
assertEq(btc.qtyEachText, "0.3333", "BTC step nearest");
assertEq(btc.totalLossText, "0.9999", "BTC loss under cap");

const pepe = calc.compute({
  direction: "long",
  stopLoss: "0.000003",
  lossCap: "5",
  leverage: "10",
  step: "1000",
  equalQty: true,
  tiers: [{ price: "0.000004" }],
});
assertEq(pepe.qtyEachText, "5000000", "PEPE step 1000");
assertEq(pepe.totalLossText, "5", "PEPE loss");

const shortState = {
  symbol: "HYPE",
  customSymbol: "",
  customStep: "",
  direction: "short",
  stopLoss: "70",
  lossCap: "300",
  leverage: "10",
  equalQty: true,
  tiers: [
    { id: "a", price: "62", qty: "" },
    { id: "b", price: "65", qty: "" },
    { id: "c", price: "68", qty: "" },
  ],
};
const rShort = run(shortState);
assertEq(rShort.qtyEachText, "20.00", "short qty");
assertEq(rShort.sumRiskText, "15", "short sum risk");
assertEq(rShort.totalQtyText, "60", "short total qty");
assertEq(rShort.totalLossText, "300", "short loss");
assertEq(rShort.totalMarginText, "390", "short margin");
assertEq(rShort.partials.map((row) => row.priceText).join(","), "62,65,68", "short fills low to high");
assertEq(rShort.partials.map((row) => row.cumLossText).join(","), "160,260,300", "short partial losses");

const spaced = calc.equallySpaced(3, "60.5", "56");
assertEq(spaced.priceTexts.join(","), "60.5,58.25,56", "equal spacing is 58.25, not 58");

let edited = calc.applyPriceEdit(calc.loadSample("cap300"), 2, "57");
let rEdit = run(edited);
assertEq(edited.equalQty, true, "price edit keeps equal mode");
assertEq(rEdit.qtyEachText, "25.00", "price edit refits qty");
assertEq(rEdit.totalLossText, "300", "price edit loss");

edited = calc.applyQtyEdit(calc.loadSample("cap300"), 0, "10");
rEdit = run(edited);
assertEq(edited.equalQty, false, "qty edit breaks equal");
assertEq(edited.tiers.map((tier) => tier.qty).join(","), "10,27.27,27.27", "other qtys frozen");
assertEq(rEdit.totalLossText, "196.35", "manual qty loss");
const brokenPrice = calc.applyPriceEdit(edited, 2, "57");
const rBroken = run(brokenPrice);
assertEq(brokenPrice.equalQty, false, "later price edit does not restore equal");
assertEq(brokenPrice.tiers.map((tier) => tier.qty).join(","), "10,27.27,27.27", "manual qtys stay");
assertEq(rBroken.totalLossText, "223.62", "broken loss uses actual qtys");
const restored = calc.restoreEqual(brokenPrice);
const rRestored = run(restored);
assertEq(restored.equalQty, true, "restore turns equal back on");
assertEq(rRestored.qtyEachText, "25.00", "restore refits");
assertEq(rRestored.totalQtyText, "75", "restore total qty");

const sameNumber = calc.applyQtyEdit(calc.loadSample("cap300"), 0, "27.27");
assertEq(sameNumber.equalQty, false, "typing the equal qty still breaks equal");
const afterLev = cloneLeverage(sameNumber, "20");
assertEq(afterLev.equalQty, false, "leverage change does not secretly restore equal");
assertEq(run(afterLev).rows.map((row) => row.qtyText).join(","), "27.27,27.27,27.27", "typed qtys remain");

const dropped = calc.applyPriceEdit(calc.loadSample("cap300"), 2, "");
const rDropped = run(dropped);
assertEq(rDropped.fitMode, "floor", "dropping a tier can floor");
assertEq(rDropped.qtyEachText, "31.57", "two-tier floor qty");
assertEq(rDropped.totalLossText, "299.915", "two-tier loss under cap");

const generated = calc.generateEqualTiers(calc.loadSample("cap300"), "3", "60.5", "56");
assertEq(generated.error, null, "generate ok");
assertEq(generated.state.equalQty, true, "generate sets equal");
assertEq(generated.state.tiers.map((tier) => tier.price).join(","), "60.5,58.25,56", "generate prices");
assertEq(run(generated.state).qtyEachText !== "27.27", true, "generated ladder is not the 58 sample");

assertEq(calc.SNAPSHOT.prices.BTC, "59600.1", "snapshot BTC");
assertEq(calc.SNAPSHOT.prices.ETH, "1673.76", "snapshot ETH");
assertEq(calc.SNAPSHOT.prices.LINK, "8.753", "snapshot LINK");
assertEq(calc.SNAPSHOT.prices.DOGE, "0.05453", "snapshot DOGE");
assertEq(calc.SNAPSHOT.prices.AAVE, "93.59", "snapshot AAVE");
assertEq(calc.SNAPSHOT.prices.SUI, "0.6393", "snapshot SUI");
assertEq(calc.SNAPSHOT.prices.PEPE, "0.0000033301", "snapshot PEPE");
assertEq(calc.SNAPSHOT.prices.WIF, "0.1192", "snapshot WIF");
assertEq(calc.SNAPSHOT.prices.HYPE, "61.138", "snapshot HYPE");
assertEq(calc.describeStep("0.01"), "数量步长 0.01（2 位小数）", "HYPE step label");
assertEq(calc.describeStep("1000"), "数量步长 1000（整数）", "PEPE step label");
assertEq(calc.describeStep("1"), "数量步长 1（整数）", "LINK step label");

const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
assertEq(app.includes("applyQtyEdit"), true, "page uses qty edit reducer");
assertEq(app.includes("restoreEqual"), true, "page uses restore");
assertEq(app.includes("clearTierPrices"), true, "page clears prices on symbol change");
assertEq(app.includes("loadSample"), false, "page does not preload a sample");
assertEq(!/60\.5/.test(app), true, "page has no baked sample price");
assertEq(app.includes("api.bitget.com"), true, "live price uses Bitget public API");
assertEq(/api[_-]?key|secret|passphrase/i.test(app + html), false, "no secrets in the page");
assertEq(/placeOrder|\/order\b|mix\/order/i.test(app + html), false, "no order placement");
assertEq(html.includes("以额定损仓位计算器"), true, "title present");
assertEq(html.includes("load-300") || html.includes("load-500") || html.includes(">300U<") || html.includes(">500U<"), false, "no sample shortcut buttons");
assertEq(html.includes("先定亏损，再算仓位"), true, "hero line");
assertEq(css.includes("Noto Sans SC") && html.includes("Noto+Sans+SC"), true, "Chinese font");
assertEq(/Market Scope/i.test(html), false, "no Market Scope wordmark");
assertEq(html.includes("恢复等量"), true, "restore button label");
assertEq(html.includes("最高价"), false, "no high-price field");
assertEq(html.includes("最低价"), false, "no low-price field");
assertEq(html.includes("等距生成"), false, "no equal-space button");
assertEq(html.includes("加档"), false, "no add-tier button");
assertEq(html.includes('id="tier-count"'), true, "tier count slider");
assertEq(html.includes('id="price-row"'), true, "compact price row");
assertEq(html.indexOf('id="price-row"') < html.indexOf('id="tier-list"'), true, "compact prices sit above detail cards");
assertEq(html.includes("微调"), true, "detail cards are marked for fine tuning");
assertEq(app.includes("innerHTML"), false, "page never rewrites element markup");
assertEq(app.includes("blur("), false, "page does not blur inputs");
assertEq(app.includes("list.appendChild(node)"), false, "tier paint does not move existing nodes");
assertEq(app.includes("activeElement === input"), true, "focused input value is left alone");
assertEq(/type="number"/.test(html + app), false, "no number inputs that reset the iOS keyboard");
assertEq(html.includes('inputmode="decimal"') && app.includes('inputMode = "decimal"'), true, "decimal keypad");
assertEq(html.includes('id="dir-long"') && html.includes('id="dir-short"'), true, "direction pills");
assertEq(html.includes('id="leverage"'), true, "leverage dropdown");
assertEq(html.includes('value="10"') && html.includes('value="100"'), true, "leverage steps include 10 and 100");
assertEq(html.includes(">×<"), true, "leverage unit mark");
assertEq(html.includes(">多<") && html.includes(">空<"), true, "long and short options");
const wiped = calc.clearTierPrices(calc.loadSample("cap300"));
assertEq(wiped.tiers.map((tier) => tier.price).join(","), ",,", "clearing tiers drops sample prices");
assertEq(wiped.equalQty, true, "clearing tiers restores equal qty");
assertEq(wiped.symbol, "HYPE", "clearing tiers keeps the symbol");
assertEq(html.includes(".nojekyll") === false, true, "page does not depend on jekyll");
assertEq(fs.existsSync(path.join(__dirname, ".nojekyll")), true, ".nojekyll exists");

const calcSrc = fs.readFileSync(path.join(__dirname, "calc.js"), "utf8");
const readme = fs.readFileSync(path.join(__dirname, "README.md"), "utf8");
assertEq(typeof calc.buildOpenPlan, "function", "plan builder is exported");
assertEq(calcSrc.includes("开仓计划："), true, "builder owns the identifier line");
assertEq(app.includes("开仓计划："), false, "template is not inlined in the page");
assertEq(calcSrc.includes("【开仓计划】以额定损"), false, "old long identifier is gone");
assertEq(app.includes("buildOpenPlan"), true, "page uses the plan builder");
assertEq(html.includes('id="copy-plan"') && html.includes("复制开仓计划"), true, "copy button");
assertEq(html.includes('id="copy-fallback"'), true, "manual copy fallback");
assertEq(html.includes('class="plan-head"') && html.indexOf('class="plan-head"') < html.indexOf('id="copy-plan"') && html.indexOf('id="copy-fallback"') < html.indexOf('class="col outputs"'), true, "headline and copy fallback share one grid item");
assertEq(css.includes("grid-area: headline") && css.includes('"inputs headline"') && css.includes('"inputs outputs"'), true, "desktop keeps the total above outputs");
const narrowLayout = css.slice(css.indexOf("@media (max-width: 820px)"));
assertEq(narrowLayout.indexOf('"headline"') !== -1 && narrowLayout.indexOf('"headline"') < narrowLayout.indexOf('"inputs"') && narrowLayout.indexOf('"inputs"') < narrowLayout.indexOf('"outputs"'), true, "phone stacks the total before inputs");
assertEq(/#copy-plan\.restore\s*\{[\s\S]*?border-color:\s*rgba\(242,\s*246,\s*255/.test(css), true, "copy button border is lighter than the card");
assertEq(app.includes("已复制"), true, "copied feedback");
assertEq(app.includes("if (!built.ok)"), true, "page refuses an incomplete plan");
assertEq(app.indexOf("if (!built.ok)") < app.indexOf("writeText"), true, "clipboard write follows the completeness check");
assertEq(app.includes(".select()"), true, "fallback selects the plan text");
assertEq(/navigator\.share|分享到/i.test(app + html), false, "no share UI");
assertEq(/mailto:|discord\.com\/api\/webhooks|hooks\.slack/i.test(app + html), false, "copy does not auto-send");
assertEq(readme.includes("复制开仓计划"), true, "readme mentions copy");

const REMINDER = "开仓前请再次核对此计划如果全部成交是否符合该计划标准，误差不应超过3%";
const hypePlan = calc.buildOpenPlan(Object.assign({}, calc.loadSample("cap300"), { refPrice: "", refTag: "" }));
const hypeText = [
  "开仓计划：",
  "标的 HYPEUSDT",
  "开仓方向：多",
  "杠杆：10×",
  "开仓方式：限价挂单",
  "档位一：60.5，数量 27.27",
  "档位二：58，数量 27.27",
  "档位三：56，数量 27.27",
  "统一挂止损：54.5",
  "统一挂止盈：无",
  "三档成交后预计亏损：299.97 U",
  "三档成交后平均成本价：58.17",
  "总保证金：475.86 U",
  "",
  REMINDER,
].join("\n");
assertEq(hypePlan.ok, true, "300U plan is complete");
assertEq(hypePlan.text, hypeText, "300U plan text");
assertEq(hypePlan.text.split("\n")[0], "开仓计划：", "identifier is the first line");
const hypeLines = hypePlan.text.split("\n");
assertEq(hypeLines.filter((line) => line === "").length, 1, "one blank line before the reminder");
assertEq(hypeLines[hypeLines.length - 2], "", "blank line sits above the reminder");
assertEq(hypeLines[hypeLines.length - 1], REMINDER, "reminder is verbatim");
assertEq(hypePlan.text.includes("市价"), false, "entries are limit tiers, not market");
assertEq(hypePlan.text.includes("限价分档"), false, "open method is 限价挂单");
assertEq(hypePlan.text.split("\n").filter((line) => line === "统一挂止盈：无").length, 1, "take-profit is 无");
assertEq(/统一挂止盈：\d/.test(hypePlan.text), false, "take-profit is not a made-up price");
["盈亏比", "合约面值", "账户权益", "风险比例", "手续费不计入", "只计算", "参考最新价", "数量步长", "数量模式", "分批成交", "保证金精确"].forEach((token) => {
  assertEq(hypePlan.text.includes(token), false, "short plan omits " + token);
});

const hypeSnap = calc.buildOpenPlan(Object.assign({}, calc.loadSample("cap300"), { refPrice: "61.138", refTag: "快照" }));
assertEq(hypeSnap.ok, true, "snapshot reference still completes");
assertEq(hypeSnap.text, hypeText, "reference price is not copied");
assertEq(hypeSnap.text.includes("参考"), false, "reference price is omitted");
const hypeDash = calc.buildOpenPlan(Object.assign({}, calc.loadSample("cap300"), { refPrice: "—", refTag: "无" }));
assertEq(hypeDash.text, hypeText, "placeholder reference is omitted");
const hypeLive = calc.buildOpenPlan(Object.assign({}, calc.loadSample("cap300"), { refPrice: "61.2", refTag: "其他" }));
assertEq(hypeLive.text, hypeText, "live reference is omitted");

const ethText = [
  "开仓计划：",
  "标的 ETHUSDT",
  "开仓方向：多",
  "杠杆：20×",
  "开仓方式：限价挂单",
  "档位一：1660，数量 1.42",
  "档位二：1620，数量 1.42",
  "档位三：1570，数量 1.42",
  "统一挂止损：1500",
  "统一挂止盈：无",
  "三档成交后预计亏损：497 U",
  "三档成交后平均成本价：1616.67",
  "总保证金：344.35 U",
  "",
  REMINDER,
].join("\n");
const ethPlan = calc.buildOpenPlan({
  symbol: "ETH",
  customSymbol: "",
  customStep: "",
  direction: "long",
  stopLoss: "1500",
  lossCap: "497",
  leverage: "20",
  equalQty: false,
  tiers: [
    { price: "1660", qty: "1.42" },
    { price: "1620", qty: "1.42" },
    { price: "1570", qty: "1.42" },
  ],
});
assertEq(ethPlan.ok, true, "ETH sample plan is complete");
assertEq(ethPlan.text, ethText, "ETH sample plan text");
ethPlan.text.split("\n").filter((line) => line.startsWith("档位")).forEach((line) => {
  assertEq(/保证金|风险|名义/.test(line), false, "tier line is price and qty only");
});

const manual = calc.applyQtyEdit(calc.loadSample("cap300"), 0, "10");
const manualPlan = calc.buildOpenPlan(manual);
assertEq(manualPlan.ok, true, "hand-edited qtys can still be copied");
assertEq(manualPlan.text.includes("数量模式"), false, "quantity mode is omitted");
assertEq(manualPlan.text.includes("档位一：60.5，数量 10.00"), true, "manual first tier");
assertEq(manualPlan.text.includes("三档成交后预计亏损：196.35 U"), true, "manual full-fill loss");
assertEq(manualPlan.text.includes("三档成交后平均成本价：57.54"), true, "manual average is two decimals");
assertEq(manualPlan.text.includes("总保证金：371.38 U"), true, "manual margin 2dp");
assertEq(manualPlan.text.includes("保证金精确"), false, "manual exact margin is omitted");
assertEq(/，保证金 |，风险 |，名义 /.test(manualPlan.text), false, "manual tiers omit margin risk and notional");

const custom = {
  symbol: "CUSTOM",
  customSymbol: "sol",
  customStep: "0.1",
  direction: "short",
  stopLoss: "100",
  lossCap: "30",
  leverage: "10",
  equalQty: true,
  tiers: [{ price: "90", qty: "" }, { price: "80", qty: "" }],
};
const customPlan = calc.buildOpenPlan(custom);
assertEq(customPlan.ok, true, "custom symbol plan");
assertEq(customPlan.text.includes("标的 sol\n"), true, "custom name is copied as entered");
assertEq(customPlan.text.includes("USDT"), false, "custom name does not gain a USDT suffix");
assertEq(customPlan.text.includes("开仓方向：空"), true, "custom short direction");
assertEq(customPlan.text.includes("开仓方式：限价挂单"), true, "custom plan is a limit order");
assertEq(customPlan.text.includes("统一挂止盈：无"), true, "custom plan has no take-profit");
assertEq(customPlan.text.includes("档位二："), true, "second tier label uses 二");
assertEq(customPlan.text.includes("两档成交后预计亏损：30 U"), true, "2-tier loss line says 两档成交后");
assertEq(customPlan.text.includes("两档成交后平均成本价：85.00"), true, "2-tier average line says 两档成交后");
assertEq(customPlan.text.includes("二档"), false, "2-tier count is not 二档");
assertEq(customPlan.text.includes("三档"), false, "2-tier plan does not say 三档");
assertEq(customPlan.text.includes("分批成交"), false, "partial-fill table is omitted");

const oneTier = {
  symbol: "BTC",
  customSymbol: "",
  customStep: "",
  direction: "long",
  stopLoss: "100",
  lossCap: "1",
  leverage: "5",
  equalQty: true,
  tiers: [{ price: "103", qty: "" }],
};
const onePlan = calc.buildOpenPlan(oneTier);
assertEq(onePlan.ok, true, "single tier plan");
assertEq(onePlan.text.includes("标的 BTCUSDT"), true, "preset uses the contract product");
assertEq(onePlan.text.includes("开仓方式：限价挂单"), true, "single tier is still a limit entry");
assertEq(onePlan.text.includes("档位一：103，数量 0.3333"), true, "single limit price and qty");
assertEq(onePlan.text.includes("市价"), false, "single tier is not a market order");
assertEq(onePlan.text.includes("一档成交后预计亏损：0.9999 U"), true, "single tier keeps the displayed loss");
assertEq(onePlan.text.includes("一档成交后平均成本价：103.00"), true, "single tier average is two decimals");
assertEq(onePlan.text.includes("总保证金：6.87 U"), true, "single tier margin 2dp");
assertEq(onePlan.text.includes("保证金精确"), false, "single tier exact margin is omitted");
assertEq(onePlan.text.includes("三档成交后"), false, "single tier does not say 三档");

const off = calc.applyQtyEdit(calc.loadSample("cap300"), 0, "10.001");
const offPlan = calc.buildOpenPlan(off);
assertEq(offPlan.ok, true, "off-step qty is still an executable plan");
assertEq(offPlan.text.includes("数量 10.001"), true, "off-step qty is kept");
assertEq(offPlan.text.includes("三档成交后预计亏损：196.356 U"), true, "off-step loss keeps displayed decimals");
assertEq(offPlan.text.includes("注意：有档位数量不是步长的整数倍"), false, "off-step note is omitted");

function blocked(extra, msg) {
  const plan = calc.buildOpenPlan(extra);
  assertEq(plan.ok, false, msg + " blocked");
  assertEq(plan.text, undefined, msg + " emits no text");
  assertEq(JSON.stringify(plan).includes("27.27"), false, msg + " does not leak a partial qty");
  return plan;
}
const missingStop = Object.assign({}, calc.loadSample("cap300"), { stopLoss: "" });
assertEq(blocked(missingStop, "missing stop").reason, "请先填好止损、额定亏和每一档开仓价", "missing stop prompt");
const missingCap = Object.assign({}, calc.loadSample("cap300"), { lossCap: "" });
assertEq(blocked(missingCap, "missing cap").reason, "请先填好止损、额定亏和每一档开仓价", "missing cap prompt");
const blankTier = calc.loadSample("cap300");
blankTier.tiers = blankTier.tiers.map((tier, index) => index === 1 ? { id: tier.id, price: "", qty: "" } : tier);
assertEq(blocked(blankTier, "blank tier").reason, "请先填好止损、额定亏和每一档开仓价", "blank tier prompt");
const wrongSide = calc.loadSample("cap300");
wrongSide.tiers = wrongSide.tiers.concat([{ id: "bad", price: "50", qty: "" }]);
assertEq(blocked(wrongSide, "wrong-side tier").ok, false, "wrong-side tier is not copied");
assertEq(blocked(wrongSide, "wrong-side tier again").reason, "请先填好止损、额定亏和每一档开仓价", "wrong-side prompt");
const noName = {
  symbol: "CUSTOM",
  customSymbol: "   ",
  customStep: "0.1",
  direction: "long",
  stopLoss: "1",
  lossCap: "10",
  leverage: "10",
  equalQty: true,
  tiers: [{ price: "2", qty: "" }],
};
assertEq(blocked(noName, "blank custom name").reason, "请先填写合约和数量步长", "blank custom name prompt");
const noStep = Object.assign({}, noName, { customSymbol: "sol", customStep: "" });
assertEq(blocked(noStep, "blank custom step").reason, "请先填写合约和数量步长", "blank custom step prompt");
const badLev = Object.assign({}, calc.loadSample("cap300"), { leverage: "0" });
assertEq(blocked(badLev, "bad leverage").reason, "请先填写有效杠杆", "bad leverage prompt");
const noDir = Object.assign({}, calc.loadSample("cap300"), { direction: "" });
assertEq(blocked(noDir, "missing direction").text, undefined, "missing direction does not default a plan");
const zeroCap = Object.assign({}, calc.loadSample("cap300"), { lossCap: "0.05" });
assertEq(blocked(zeroCap, "zero qty").reason, "当前结果无法生成完整开仓计划", "zero qty prompt");
const manualZero = calc.applyQtyEdit(calc.loadSample("cap300"), 1, "0");
assertEq(blocked(manualZero, "manual zero tier").reason, "当前结果无法生成完整开仓计划", "manual zero tier prompt");

function cloneLeverage(state, leverage) {
  return {
    symbol: state.symbol,
    customSymbol: state.customSymbol,
    customStep: state.customStep,
    direction: state.direction,
    stopLoss: state.stopLoss,
    lossCap: state.lossCap,
    leverage: leverage,
    equalQty: state.equalQty,
    tiers: state.tiers.map((tier) => ({ id: tier.id, price: tier.price, qty: tier.qty })),
  };
}

if (failed) {
  console.error("\n" + failed + " assertion(s) failed");
  process.exit(1);
}
console.log("\nAll assertions passed");
