const { ethers } = require("ethers");
const { quoteLeg, quoteV2, quoteV3 } = require("./prices");

const BPS_DENOMINATOR = 10000n;

/// Quotes 1 WETH -> a reference stablecoin on a live DEX pool, so gas costs and profit can be
/// priced in USD without paying for an external price API. Returns null if ethUsdRoute isn't set.
async function getEthUsdPrice(provider, ethUsdRoute) {
  if (!ethUsdRoute) return null;

  const oneEth = ethers.parseUnits("1", 18);
  const out =
    ethUsdRoute.kind === "V2"
      ? await quoteV2(provider, ethUsdRoute.router, ethUsdRoute.weth, ethUsdRoute.usdc, oneEth)
      : await quoteV3(provider, ethUsdRoute.router, ethUsdRoute.weth, ethUsdRoute.usdc, ethUsdRoute.fee, oneEth);

  return Number(ethers.formatUnits(out, ethUsdRoute.usdcDecimals));
}

/// Estimates the USD cost of submitting the arbitrage transaction.
function estimateGasCostUsd({ gasPriceWei, gasLimit, gasPriceBufferPct, ethUsdPrice }) {
  if (ethUsdPrice === null) return null;
  const bufferedGasPrice = (gasPriceWei * BigInt(100 + gasPriceBufferPct)) / 100n;
  const gasCostWei = bufferedGasPrice * gasLimit;
  return Number(ethers.formatUnits(gasCostWei, 18)) * ethUsdPrice;
}

/// Converts a raw profit amount (in borrowedToken units) into USD, when possible.
/// Returns null when the borrowed token is neither a stablecoin nor WETH, since that's the only
/// case this bot can price without an external feed - see README "Configuring pairs & DEXs".
function profitInUsd(profitTokenUnits, borrowedToken, ethUsdPrice) {
  const asFloat = Number(ethers.formatUnits(profitTokenUnits, borrowedToken.decimals));
  if (borrowedToken.isStable) return asFloat;
  if (borrowedToken.isWeth && ethUsdPrice !== null) return asFloat * ethUsdPrice;
  return null;
}

/// Scans one configured trade size for one pair and returns an opportunity descriptor
/// (profitable or not) - never throws for "just not profitable", only for real errors.
async function scanTradeSize({ provider, pair, tradeSizeHuman, config, gasPriceWei, ethUsdPrice }) {
  const amountIn = ethers.parseUnits(tradeSizeHuman, pair.borrowedToken.decimals);

  const intermediateOut = await quoteLeg(provider, pair.legOut, pair.borrowedToken.address, amountIn);
  const finalOut = await quoteLeg(provider, pair.legBack, pair.intermediateToken.address, intermediateOut);

  const premium = (amountIn * config.aaveFlashLoanPremiumBps) / BPS_DENOMINATOR;
  const owed = amountIn + premium;
  const grossProfit = finalOut - owed; // bigint, may be negative

  const gasCostUsd = estimateGasCostUsd({
    gasPriceWei,
    gasLimit: config.gasLimitEstimate,
    gasPriceBufferPct: config.gasPriceBufferPct,
    ethUsdPrice,
  });
  const grossProfitUsd = profitInUsd(grossProfit, pair.borrowedToken, ethUsdPrice);
  const netProfitUsd = grossProfitUsd !== null && gasCostUsd !== null ? grossProfitUsd - gasCostUsd : null;

  const meetsUsdThreshold = netProfitUsd !== null ? netProfitUsd >= config.minProfitUsd : grossProfit > 0n;

  return {
    pair,
    tradeSizeHuman,
    amountIn,
    intermediateOut,
    finalOut,
    premium,
    owed,
    grossProfit,
    grossProfitUsd,
    gasCostUsd,
    netProfitUsd,
    isOpportunity: grossProfit > 0n && meetsUsdThreshold,
  };
}

/// Scans every configured trade size for a pair and returns only the results worth logging,
/// sorted with the best (highest net-of-fee output) first.
async function scanPair({ provider, pair, config, gasPriceWei, ethUsdPrice }) {
  const results = [];
  for (const tradeSizeHuman of pair.tradeSizes) {
    try {
      results.push(await scanTradeSize({ provider, pair, tradeSizeHuman, config, gasPriceWei, ethUsdPrice }));
    } catch (err) {
      results.push({ pair, tradeSizeHuman, error: err.message });
    }
  }
  return results.sort((a, b) => {
    if (a.error) return 1;
    if (b.error) return -1;
    return a.grossProfit > b.grossProfit ? -1 : a.grossProfit < b.grossProfit ? 1 : 0;
  });
}

module.exports = { getEthUsdPrice, scanTradeSize, scanPair };
