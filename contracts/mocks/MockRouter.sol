// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV2Router02Like} from "../interfaces/IUniswapV2Router02Like.sol";
import {ISwapRouterV3Like} from "../interfaces/ISwapRouterV3Like.sol";

interface IMintableERC20 {
    function mint(address to, uint256 amount) external;
}

/// @notice Test-only DEX stand-in implementing both router interfaces the executor supports.
///         Pulls tokenIn and mints tokenOut at a configurable rate, so tests can create a price
///         gap between two MockRouter instances to simulate a real arbitrage opportunity.
contract MockRouter is IUniswapV2Router02Like, ISwapRouterV3Like {
    // amountOut = amountIn * rate / 1e18
    mapping(address => mapping(address => uint256)) public rate;

    function setRate(address tokenIn, address tokenOut, uint256 rate_) external {
        rate[tokenIn][tokenOut] = rate_;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external override returns (uint256[] memory amounts) {
        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];
        uint256 amountOut = _doSwap(tokenIn, tokenOut, amountIn, to);
        require(amountOut >= amountOutMin, "MOCK_ROUTER_SLIPPAGE");

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[amounts.length - 1] = amountOut;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        override
        returns (uint256[] memory amounts)
    {
        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[amounts.length - 1] = (amountIn * rate[tokenIn][tokenOut]) / 1e18;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        amountOut = _doSwap(params.tokenIn, params.tokenOut, params.amountIn, params.recipient);
        require(amountOut >= params.amountOutMinimum, "MOCK_ROUTER_SLIPPAGE");
    }

    function _doSwap(address tokenIn, address tokenOut, uint256 amountIn, address to)
        internal
        returns (uint256 amountOut)
    {
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        amountOut = (amountIn * rate[tokenIn][tokenOut]) / 1e18;
        IMintableERC20(tokenOut).mint(to, amountOut);
    }
}
