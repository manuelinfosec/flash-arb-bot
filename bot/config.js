require("dotenv").config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env (locally) or set it as a ` +
        "GitHub Actions secret (in CI) - see the README setup section."
    );
  }
  return value;
}

function optionalString(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function optionalNumber(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : Number(value);
}

function loadPairs() {
  const raw = required("PAIRS_CONFIG_JSON");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`PAIRS_CONFIG_JSON is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("PAIRS_CONFIG_JSON must be a non-empty array. See .env.example for the shape.");
  }
  return parsed;
}

function loadEthUsdRoute() {
  const raw = process.env.ETH_USD_ROUTE_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`ETH_USD_ROUTE_JSON is not valid JSON: ${err.message}`);
  }
}

const dryRun = optionalString("DRY_RUN", "true").toLowerCase() !== "false";

const config = {
  rpcUrl: required("ARBITRUM_RPC_URL"),
  dryRun,
  // Only needed when DRY_RUN=false - this wallet needs a small ETH/ARB balance to pay gas.
  // It is NOT the flash loan capital: the flash loan itself always borrows with zero collateral.
  privateKey: process.env.PRIVATE_KEY,
  contractAddress: process.env.CONTRACT_ADDRESS,

  aaveFlashLoanPremiumBps: BigInt(optionalNumber("AAVE_FLASH_LOAN_PREMIUM_BPS", 5)), // 0.05% Aave V3 default

  minProfitUsd: optionalNumber("MIN_PROFIT_USD", 5),
  minProfitBufferBps: BigInt(optionalNumber("MIN_PROFIT_BUFFER_BPS", 5000)), // require on-chain minProfit >= 50% of the off-chain estimate, to absorb slippage/front-running between quote and execution
  slippageBps: BigInt(optionalNumber("SLIPPAGE_BPS", 50)), // 0.5% per-leg slippage tolerance for minAmountOut

  gasLimitEstimate: BigInt(optionalNumber("GAS_LIMIT_ESTIMATE", 700000)),
  gasPriceBufferPct: optionalNumber("GAS_PRICE_BUFFER_PCT", 20),

  // Optional: lets the bot price gas in USD by quoting 1 WETH -> a stablecoin on a live DEX pool.
  // Required only for pairs whose borrowed token is WETH or a stablecoin (see README). Leave unset
  // to skip USD filtering entirely and rely solely on the contract's on-chain minProfit guard.
  ethUsdRoute: loadEthUsdRoute(),

  // Array of pair configs to scan - tokens, routers, trade sizes. See .env.example for the shape.
  pairs: loadPairs(),
};

module.exports = config;
