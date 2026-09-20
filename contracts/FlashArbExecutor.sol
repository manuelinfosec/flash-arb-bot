// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {FlashLoanSimpleReceiverBase} from "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IUniswapV2Router02Like} from "./interfaces/IUniswapV2Router02Like.sol";
import {ISwapRouterV3Like} from "./interfaces/ISwapRouterV3Like.sol";

/// @title FlashArbExecutor
/// @notice Borrows a token with zero collateral via an Aave V3 simple flash loan, swaps it out
///         and back across two DEX routers, repays the loan + premium, and forwards any surplus
///         to the owner. The whole trade is one atomic transaction: if the round trip does not
///         clear `minProfit`, the `NOT_PROFITABLE` require reverts everything (including the
///         swaps and the loan itself), so an unprofitable attempt never touches borrowed capital
///         — the caller only loses the gas spent submitting it.
contract FlashArbExecutor is FlashLoanSimpleReceiverBase, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum DexKind {
        V2,
        V3
    }

    struct Leg {
        DexKind kind;
        address router;
        address tokenOut;
        uint24 v3Fee; // pool fee tier in hundredths of a bip; only used when kind == V3
        uint256 minAmountOut;
    }

    struct ArbParams {
        Leg leg1; // borrowed token -> intermediate token
        Leg leg2; // intermediate token -> borrowed token
        uint256 minProfit; // minimum net profit required (borrowed token units), else revert
        uint256 deadline;
    }

    event ArbitrageExecuted(
        address indexed initiator,
        address indexed borrowedToken,
        uint256 amountBorrowed,
        uint256 premium,
        uint256 profit
    );

    constructor(address addressesProvider, address initialOwner)
        FlashLoanSimpleReceiverBase(IPoolAddressesProvider(addressesProvider))
        Ownable(initialOwner)
    {}

    /// @notice Kicks off the flash loan + arbitrage. Restricted to the owner (the wallet the
    ///         off-chain bot signs with) so nobody else can force this contract to trade.
    function startArbitrage(address borrowedToken, uint256 amount, ArbParams calldata params)
        external
        onlyOwner
        nonReentrant
    {
        require(block.timestamp <= params.deadline, "EXPIRED");
        bytes memory data = abi.encode(params);
        POOL.flashLoanSimple(address(this), borrowedToken, amount, data, 0);
    }

    /// @dev Aave V3 callback. Must be called by the Pool, mid-flashloan, with this contract as
    ///      the initiator (i.e. only reachable via startArbitrage).
    function executeOperation(address asset, uint256 amount, uint256 premium, address initiator, bytes calldata params)
        external
        override
        returns (bool)
    {
        require(msg.sender == address(POOL), "CALLER_NOT_POOL");
        require(initiator == address(this), "UNTRUSTED_INITIATOR");

        ArbParams memory arb = abi.decode(params, (ArbParams));
        require(block.timestamp <= arb.deadline, "EXPIRED");

        uint256 intermediateOut = _swap(arb.leg1, asset, amount);
        uint256 finalOut = _swap(arb.leg2, arb.leg1.tokenOut, intermediateOut);

        uint256 totalOwed = amount + premium;
        require(finalOut >= totalOwed + arb.minProfit, "NOT_PROFITABLE");

        uint256 profit = finalOut - totalOwed;

        IERC20(asset).forceApprove(address(POOL), totalOwed);

        if (profit > 0) {
            IERC20(asset).safeTransfer(owner(), profit);
        }

        emit ArbitrageExecuted(initiator, asset, amount, premium, profit);
        return true;
    }

    function _swap(Leg memory leg, address tokenIn, uint256 amountIn) internal returns (uint256) {
        IERC20(tokenIn).forceApprove(leg.router, amountIn);

        if (leg.kind == DexKind.V2) {
            address[] memory path = new address[](2);
            path[0] = tokenIn;
            path[1] = leg.tokenOut;
            uint256[] memory amounts = IUniswapV2Router02Like(leg.router).swapExactTokensForTokens(
                amountIn, leg.minAmountOut, path, address(this), block.timestamp
            );
            return amounts[amounts.length - 1];
        }

        ISwapRouterV3Like.ExactInputSingleParams memory p = ISwapRouterV3Like.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: leg.tokenOut,
            fee: leg.v3Fee,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amountIn,
            amountOutMinimum: leg.minAmountOut,
            sqrtPriceLimitX96: 0
        });
        return ISwapRouterV3Like(leg.router).exactInputSingle(p);
    }

    /// @notice Recover any ERC20 left in the contract (e.g. dust from a partially filled trade).
    function sweepToken(address token, address to) external onlyOwner {
        IERC20(token).safeTransfer(to, IERC20(token).balanceOf(address(this)));
    }

    /// @notice Recover any native ETH sent to the contract.
    function sweepNative(address payable to) external onlyOwner {
        (bool success,) = to.call{value: address(this).balance}("");
        require(success, "NATIVE_SWEEP_FAILED");
    }

    receive() external payable {}
}
