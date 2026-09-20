const ERC20_ABI = ["function decimals() view returns (uint8)", "function symbol() view returns (string)"];

const V2_ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] calldata path) view returns (uint256[] memory amounts)",
];

// Uniswap V3 QuoterV2 - quoteExactInputSingle is non-view on-chain but side-effect free,
// so callers must invoke it via eth_call (ethers .staticCall) rather than sending a tx.
const V3_QUOTER_ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];

const LEG_TUPLE = "(uint8 kind,address router,address tokenOut,uint24 v3Fee,uint256 minAmountOut)";

const FLASH_ARB_EXECUTOR_ABI = [
  `function startArbitrage(address borrowedToken, uint256 amount, (${LEG_TUPLE} leg1, ${LEG_TUPLE} leg2, uint256 minProfit, uint256 deadline) params) external`,
  "event ArbitrageExecuted(address indexed initiator, address indexed borrowedToken, uint256 amountBorrowed, uint256 premium, uint256 profit)",
];

module.exports = { ERC20_ABI, V2_ROUTER_ABI, V3_QUOTER_ABI, FLASH_ARB_EXECUTOR_ABI };
