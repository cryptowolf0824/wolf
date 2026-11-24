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
