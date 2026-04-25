// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "https://github.com/aave/flashloan-box/blob/Remix/contracts/aave/FlashLoanReceiverBase.sol";
import "https://github.com/aave/flashloan-box/blob/Remix/contracts/aave/ILendingPoolAddressesProvider.sol";
import "https://github.com/aave/flashloan-box/blob/Remix/contracts/aave/ILendingPool.sol";
import "https://github.com/sushiswap/sushiswap/blob/master/contracts/uniswapv2/interfaces/IUniswapV2Router02.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/IERC20.sol";

contract FlashArbBot is FlashLoanReceiverBase, Ownable {

    IUniswapV2Router02 public immutable uniswapV2Router;
    IUniswapV2Router02 public immutable sushiswapV1Router;

    // Struct to hold parameters passed through Aave's flash loan callback
    // This avoids saving variables to state, saving massive amounts of gas.
    struct ArbParams {
        address assetToFlashLoan;  // e.g., WETH
        address targetAsset;       // e.g., DAI
        uint256 amountToTrade;
    }

    constructor(
        address _aaveLendingPool, 
        address _uniswapV2Router, 
        address _sushiswapV1Router
    ) FlashLoanReceiverBase(_aaveLendingPool) {
        // Instantiate Routers
        uniswapV2Router = IUniswapV2Router02(_uniswapV2Router);
        sushiswapV1Router = IUniswapV2Router02(_sushiswapV1Router);
    }

    /**
     * @dev Initiates the flash loan
     */
    function requestFlashLoan(
        address _assetToFlashLoan, 
        uint256 _flashAmount,
        address _targetAsset,
        uint256 _amountToTrade
    ) external onlyOwner {
        
        // Encode our custom parameters to send to Aave
        bytes memory params = abi.encode(
            ArbParams({
                assetToFlashLoan: _assetToFlashLoan,
                targetAsset: _targetAsset,
                amountToTrade: _amountToTrade
            })
        );

        ILendingPool lendingPool = ILendingPool(addressesProvider.getLendingPool());
        
        // Request the flash loan
        lendingPool.flashLoan(
            address(this), 
            _assetToFlashLoan, 
            _flashAmount, 
            params
        );
    }

    /**
     * @dev Aave callback function. Executes after funds are received.
     */
    function executeOperation(
        address _reserve,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _params
    ) external override returns (bool) {
        require(_amount <= getBalanceInternal(address(this), _reserve), "Invalid balance");

        // Decode the parameters we packed in requestFlashLoan
        ArbParams memory decodedParams = abi.decode(_params, (ArbParams));

        // Calculate dynamic deadline (Fix for Bug #1)
        uint256 deadline = block.timestamp + 300; 

        // Execute the arbitrage logic
        _executeArbitrage(decodedParams, deadline);

        // Calculate total debt and approve Aave to pull the funds back
        uint256 totalDebt = _amount + _fee;
        
        // Ensure we have enough balance to repay the loan
        require(IERC20(_reserve).balanceOf(address(this)) >= totalDebt, "Arbitrage failed: Not enough profit to repay loan");

        transferFundsBackToPoolInternal(_reserve, totalDebt);
        
        return true;
    }

    /**
     * @dev Core Arbitrage Logic: Swap on Uni, Swap back on Sushi
     */
    function _executeArbitrage(ArbParams memory params, uint256 deadline) internal {
        
        IERC20 baseAsset = IERC20(params.assetToFlashLoan);
        IERC20 targetAsset = IERC20(params.targetAsset);

        // --- TRADE 1: UNISWAP ---
        // Approve Uniswap to spend the flash-loaned asset
        baseAsset.approve(address(uniswapV2Router), params.amountToTrade);

        address[] memory path1 = new address[](2);
        path1[0] = params.assetToFlashLoan;
        path1[1] = params.targetAsset;

        // Perform Trade 1 (Base Asset -> Target Asset)
        uniswapV2Router.swapExactTokensForTokens(
            params.amountToTrade,
            0, // Accept any amount out for the first leg, or calculate minimum acceptable
            path1,
            address(this),
            deadline
        );

        // Check how much Target Asset we actually received
        uint256 targetAssetBalance = targetAsset.balanceOf(address(this));

        // --- TRADE 2: SUSHISWAP ---
        // Approve Sushiswap to spend the newly acquired target asset
        targetAsset.approve(address(sushiswapV1Router), targetAssetBalance);

        address[] memory path2 = new address[](2);
        path2[0] = params.targetAsset;
        path2[1] = params.assetToFlashLoan;

        // Perform Trade 2 (Target Asset -> Base Asset)
        sushiswapV1Router.swapExactTokensForTokens(
            targetAssetBalance,
            0, // Must calculate minimum output to ensure profitability!
            path2,
            address(this),
            deadline
        );
    }

    /**
     * @dev Withdraws all tokens and ETH back to the owner (Fix for Bug #2)
     */
    function withdrawBalance(address _tokenAddress) external onlyOwner {
        if (_tokenAddress == address(0)) {
            // Withdraw ETH
            (bool success, ) = msg.sender.call{value: address(this).balance}("");
            require(success, "ETH transfer failed");
        } else {
            // Withdraw ERC20
            IERC20 token = IERC20(_tokenAddress);
            token.transfer(msg.sender, token.balanceOf(address(this)));
        }
    }

    // Required to receive ETH
    receive() external payable {}
}
