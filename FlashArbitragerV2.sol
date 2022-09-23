// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

/**
    Ropsten instances:
    - Uniswap V2 Router:                    0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
    - Sushiswap V1 Router:                  No official sushi routers on testnet
    - DAI:                                  0xf80A32A835F79D7787E8a8ee5721D0fEaFd78108
    - ETH:                                  0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
    - Aave LendingPoolAddressesProvider:    0x1c8756FD2B28e9426CDBDcC7E3c4d64fa9A54728
    
    Mainnet instances:
    - Uniswap V2 Router:                    0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
    - Sushiswap V1 Router:                  0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F
    - DAI:                                  0x6B175474E89094C44Da98b954EedeAC495271d0F
    - ETH:                                  0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
    - Aave LendingPoolAddressesProvider:    0x24a42fD28C976A61Df5D00D0599C34c4f90748c8
*/

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';

import './interfaces/IERC3156FlashBorrower.sol';
import './interfaces/IERC3156FlashLender.sol';

contract ArbitragerV2 is IERC3156FlashBorrower {
    
    enum Direction {
        UNISWAP_SUSHISWAP,
        SUSHISWAP_UNISWAP
    }

    struct ExtraData {
        address swapToken;
        Direction direction;
        uint256 deadline;
        uint256 amountRequired;
        address profitReceiver;
        uint256 minAmountSwapToken;
        uint256 minAmountBorrowedToken;
    }
    
    IERC3156FlashLender public immutable lender;
    IUniswapV2Router02 public immutable uniswapRouter;
    IUniswapV2Router02 public immutable sushiswapRouter;

    constructor(
        IERC3156FlashLender _lender,
        IUniswapV2Router02 _uniswapRouter,
        IUniswapV2Router02 _sushiswapRouter
    ) {
        lender = _lender;
        uniswapRouter = _uniswapRouter;
        sushiswapRouter = _sushiswapRouter;
    }

    function onFlashLoan(
        address initiator,
        address borrowedToken,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override returns (bytes32) {
        require(msg.sender == address(lender), 'FLASH_BORROWER_UNTRUSTED_LENDER');
        require(initiator == address(this), 'FLASH_BORROWER_LOAN_INITIATOR');

        IERC20 borrowedTokenContract = IERC20(borrowedToken);
        ExtraData memory extraData = abi.decode(data, (ExtraData));
        (IUniswapV2Router02 router1, IUniswapV2Router02 router2) = _getRouters(extraData.direction);

        // Call protocol 1
        uint256 amountReceivedSwapToken = _protocolCall(
            router1,
            borrowedToken,
            extraData.swapToken,
            amount,
            extraData.minAmountSwapToken,
            extraData.deadline
        );

        // Call protocol 2
        uint256 amountReceivedBorrowedToken = _protocolCall(
            router2,
            extraData.swapToken,
            borrowedToken,
            amountReceivedSwapToken,
            extraData.minAmountBorrowedToken,
            extraData.deadline
        );

        uint256 repay = amount + fee;

        // Transfer profits
        borrowedTokenContract.transfer(
            extraData.profitReceiver,
            amountReceivedBorrowedToken - repay - extraData.amountRequired
        );

        // Approve lender
        borrowedTokenContract.approve(address(lender), repay);

        return keccak256('ERC3156FlashBorrower.onFlashLoan');
    }

    function arbitrage(
        address borrowedToken,
        uint256 amount,
        ExtraData memory extraData
    ) public {
        _checkAmountOut(borrowedToken, amount, extraData);
        bytes memory _data = abi.encode(extraData);
        lender.flashLoan(this, borrowedToken, amount, _data);
    }

    function _checkAmountOut(
        address borrowedToken,
        uint256 amount,
        ExtraData memory extraData
    ) internal view {
        (IUniswapV2Router02 router1, IUniswapV2Router02 router2) = _getRouters(extraData.direction);

        uint256 amountOutSwapToken = _getAmountOut(router1, borrowedToken, extraData.swapToken, amount);
        uint256 amountOutBorrowedToken = _getAmountOut(router2, extraData.swapToken, borrowedToken, amountOutSwapToken);
        require(amountOutBorrowedToken >= extraData.minAmountBorrowedToken, 'ARBITRAGER_AMOUNT_OUT_TOO_LOW');
    }

    function _getRouters(Direction direction) internal view returns (IUniswapV2Router02, IUniswapV2Router02) {
        if (direction == Direction.SUSHISWAP_UNISWAP) {
            return (sushiswapRouter, uniswapRouter);
        }

        return (uniswapRouter, sushiswapRouter);
    }

    function _getAmountOut(
        IUniswapV2Router02 router,
        address token1,
        address token2,
        uint256 amount
    ) internal view returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = token1;
        path[1] = token2;

        return router.getAmountsOut(amount, path)[1];
    }

    function _protocolCall(
        IUniswapV2Router02 router,
        address token1,
        address token2,
        uint256 amount,
        uint256 minAmount,
        uint256 deadline
    ) internal returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = token1;
        path[1] = token2;
        IERC20(token1).approve(address(router), amount);

        return router.swapExactTokensForTokens(amount, minAmount, path, address(this), deadline)[1];
    }
}
