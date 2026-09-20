const { ethers } = require("ethers");
const config = require("./config");
const { getEthUsdPrice, scanPair } = require("./scanner");
const { maybeExecute } = require("./executor");

async function main() {
  console.log(`flash-arb-bot scan starting - DRY_RUN=${config.dryRun} - ${new Date().toISOString()}`);
  if (config.dryRun) {
    console.log("Running in SIMULATION mode: opportunities are logged, no transaction is sent.");
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);

  const [feeData, ethUsdPrice] = await Promise.all([
    provider.getFeeData(),
    getEthUsdPrice(provider, config.ethUsdRoute),
  ]);
  const gasPriceWei = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;

  if (ethUsdPrice !== null) {
    console.log(`Reference price: 1 WETH ~= $${ethUsdPrice.toFixed(2)} (from ETH_USD_ROUTE_JSON)`);
  } else {
    console.log("No ETH_USD_ROUTE_JSON configured - USD filtering is disabled, using raw on-chain profit only.");
  }

  let scanned = 0;
  let opportunities = 0;
  let executed = 0;

  for (const pair of config.pairs) {
    console.log(`\nScanning ${pair.label} ...`);
    const results = await scanPair({ provider, pair, config, gasPriceWei, ethUsdPrice });

    for (const result of results) {
      scanned += 1;

      if (result.error) {
        console.log(`  ${result.tradeSizeHuman} ${pair.borrowedToken.symbol}: ERROR - ${result.error}`);
        continue;
      }

      const profitStr = ethers.formatUnits(result.grossProfit, pair.borrowedToken.decimals);
      const usdStr = result.netProfitUsd !== null ? ` (~$${result.netProfitUsd.toFixed(2)} net)` : "";
      console.log(
        `  ${result.tradeSizeHuman} ${pair.borrowedToken.symbol}: gross profit ${profitStr} ` +
          `${pair.borrowedToken.symbol}${usdStr}${result.isOpportunity ? " -> OPPORTUNITY" : ""}`
      );

      if (result.isOpportunity) {
        opportunities += 1;
        const outcome = await maybeExecute({ opportunity: result, provider, config });
        if (outcome.submitted) executed += 1;
      }
    }
  }

  console.log(
    `\nDone: ${scanned} quotes checked, ${opportunities} opportunit${opportunities === 1 ? "y" : "ies"} found, ` +
      `${executed} transaction attempt(s).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("flash-arb-bot scan failed:", err);
    process.exit(1);
  });
