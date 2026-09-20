const { ethers } = require("ethers");
const { FLASH_ARB_EXECUTOR_ABI } = require("./abis");

const BPS_DENOMINATOR = 10000n;
const DEX_KIND = { V2: 0, V3: 1 };

function withSlippage(amount, slippageBps) {
  return (amount * (BPS_DENOMINATOR - slippageBps)) / BPS_DENOMINATOR;
}

function buildLeg(leg, quotedOut, slippageBps) {
  return {
    kind: DEX_KIND[leg.kind],
    router: leg.router,
    tokenOut: leg.tokenOut,
    v3Fee: leg.v3Fee || 0,
    minAmountOut: withSlippage(quotedOut, slippageBps),
  };
}

/// Either logs the opportunity (DRY_RUN, the default) or submits the flash-loan transaction
/// against the deployed FlashArbExecutor contract. Never throws for an execution failure - a
/// reverted/failed live trade is caught, logged, and the scan loop continues to the next pair.
async function maybeExecute({ opportunity, provider, config }) {
  const { pair, amountIn, intermediateOut, finalOut, grossProfit } = opportunity;

  if (config.dryRun) {
    console.log(
      `  [SIMULATED] would flash-borrow ${ethers.formatUnits(amountIn, pair.borrowedToken.decimals)} ` +
        `${pair.borrowedToken.symbol}, expected profit ` +
        `${ethers.formatUnits(grossProfit, pair.borrowedToken.decimals)} ${pair.borrowedToken.symbol}` +
        (opportunity.netProfitUsd !== null ? ` (~$${opportunity.netProfitUsd.toFixed(2)} net of gas)` : "")
    );
    return { submitted: false };
  }

  if (!config.privateKey || !config.contractAddress) {
    console.log("  [SKIPPED] DRY_RUN=false but PRIVATE_KEY or CONTRACT_ADDRESS is not set - not submitting.");
    return { submitted: false };
  }

  const wallet = new ethers.Wallet(config.privateKey, provider);
  const contract = new ethers.Contract(config.contractAddress, FLASH_ARB_EXECUTOR_ABI, wallet);

  const params = {
    leg1: buildLeg(pair.legOut, intermediateOut, config.slippageBps),
    leg2: buildLeg(pair.legBack, finalOut, config.slippageBps),
    // Require the on-chain execution to still clear at least half of the off-chain estimate,
    // so a price move between quoting and mining reverts the whole (borrowed-capital) trade
    // instead of executing at a worse-than-expected profit.
    minProfit: (grossProfit * config.minProfitBufferBps) / BPS_DENOMINATOR,
    deadline: Math.floor(Date.now() / 1000) + 300,
  };

  try {
    const tx = await contract.startArbitrage(pair.borrowedToken.address, amountIn, params);
    console.log(`  [SUBMITTED] tx ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`  [CONFIRMED] block ${receipt.blockNumber}, status ${receipt.status === 1 ? "success" : "FAILED"}`);
    return { submitted: true, txHash: tx.hash, receipt };
  } catch (err) {
    console.error(`  [FAILED] ${err.shortMessage || err.message}`);
    return { submitted: true, error: err.shortMessage || err.message };
  }
}

module.exports = { maybeExecute };
