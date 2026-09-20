// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFlashLoanSimpleReceiverLike {
    function executeOperation(address asset, uint256 amount, uint256 premium, address initiator, bytes calldata params)
        external
        returns (bool);
}

/// @notice Test-only stand-in for Aave V3's Pool.flashLoanSimple. Mirrors the real fee
///         semantics (a premium in bps) so unit tests can exercise the profit-guard logic
///         without needing a live mainnet fork.
contract MockPool {
    uint16 public premiumBps = 5; // 0.05%, matches Aave V3's default flash loan premium

    function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16)
        external
    {
        uint256 premium = (amount * premiumBps) / 10_000;

        IERC20(asset).transfer(receiverAddress, amount);

        require(
            IFlashLoanSimpleReceiverLike(receiverAddress).executeOperation(asset, amount, premium, msg.sender, params),
            "EXECUTE_OPERATION_FAILED"
        );

        IERC20(asset).transferFrom(receiverAddress, address(this), amount + premium);
    }
}
