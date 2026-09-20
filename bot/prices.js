const { ethers } = require("ethers");
const { V2_ROUTER_ABI, V3_QUOTER_ABI } = require("./abis");

/// Quotes a V2-style router (SushiSwap, Camelot V2, ...): amountIn of tokenIn -> tokenOut.
async function quoteV2(provider, routerAddress, tokenIn, tokenOut, amountIn) {
  const router = new ethers.Contract(routerAddress, V2_ROUTER_ABI, provider);
  const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
  return amounts[amounts.length - 1];
}

/// Quotes Uniswap V3's QuoterV2 for a single-hop exactInput swap.
async function quoteV3(provider, quoterAddress, tokenIn, tokenOut, fee, amountIn) {
  const quoter = new ethers.Contract(quoterAddress, V3_QUOTER_ABI, provider);
  const result = await quoter.quoteExactInputSingle.staticCall({
    tokenIn,
    tokenOut,
    amountIn,
    fee,
    sqrtPriceLimitX96: 0n,
  });
  return result.amountOut;
}

/// Dispatches to quoteV2/quoteV3 based on a leg's `kind` ("V2" | "V3").
///
/// Note: for a V3 leg, `leg.router` is the SwapRouter used to *execute* the swap on-chain, but
/// Uniswap V3's SwapRouter does not itself expose a view-quoting function - quoting requires the
/// separate QuoterV2 contract. So V3 legs must also set `leg.quoter` to that address; V2-style
/// routers expose getAmountsOut directly, so no separate quoter is needed there.
async function quoteLeg(provider, leg, tokenIn, amountIn) {
  if (leg.kind === "V2") {
    return quoteV2(provider, leg.router, tokenIn, leg.tokenOut, amountIn);
  }
  if (leg.kind === "V3") {
    if (!leg.quoter) {
      throw new Error(
        `V3 leg for router ${leg.router} is missing "quoter" - set it to the Uniswap V3 QuoterV2 address.`
      );
    }
    return quoteV3(provider, leg.quoter, tokenIn, leg.tokenOut, leg.v3Fee, amountIn);
  }
  throw new Error(`Unknown leg kind: ${leg.kind}`);
}

module.exports = { quoteV2, quoteV3, quoteLeg };
