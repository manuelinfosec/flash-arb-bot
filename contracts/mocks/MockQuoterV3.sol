// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRateSource {
    function rate(address tokenIn, address tokenOut) external view returns (uint256);
}

/// @notice Test-only stand-in for Uniswap V3's QuoterV2.quoteExactInputSingle. Reads its
///         exchange rate from a MockRouter's public `rate` mapping, so a single `setRate` call
///         drives both the quoting leg and the executing leg consistently in local tests -
///         mirroring how a real QuoterV2 and SwapRouter agree on the same pool's price.
contract MockQuoterV3 {
    IRateSource public immutable rateSource;

    constructor(address _rateSource) {
        rateSource = IRateSource(_rateSource);
    }

    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams calldata params)
        external
        view
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)
    {
        uint256 r = rateSource.rate(params.tokenIn, params.tokenOut);
        amountOut = (params.amountIn * r) / 1e18;
        sqrtPriceX96After = 0;
        initializedTicksCrossed = 0;
        gasEstimate = 100000;
    }
}
