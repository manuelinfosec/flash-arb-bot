// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal interface shared by Uniswap V2-style routers (SushiSwap, Camelot V2, etc).
interface IUniswapV2Router02Like {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);
}
