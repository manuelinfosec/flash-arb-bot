# Flash Loan Arbitrage Bot
This repo holds a functional implementation of flash loan and arbitrage swap on Ethereum developed and executed last year.

## Why are you releasing it? 
It created lower-than-expected returns, so I moved on. I think it might be useful for others as learning material. 
<br><br>
Even though it made some [profits live](https://ethtx.info/mainnet/0x0f3a3dbc5d6887c08b4f1bf039b3676aa4ba0256e7e4f6d6d94ceb0e50fff9ea/), it wasn't up to my expectations. Although there were some little miscalculations, here is a summary of one of my profitable transactions:

![](https://raw.githubusercontent.com/manuelinfosec/flash-arb-bot/main/images/summary.jpg)

I made two other iterations of this arbitrage which will be released shortly, with similar commentary.

## Overview

This is a simple working example of a flash arbitrage smart contract. Within a single transaction it:
1. Instantly flash borrows a certain asset (ETH in this example) from Aave lending pools with zero collateral
2. Calls UniswapV2 Router02 to wrap the flash liquidity of ETH into WETH and exchange it for DAI tokens
3. Checks the exchange rate of DAI back into ETH on Sushiswap V1
4. Calls SushiswapV1 Router02 to swap the DAI back into WETH and then ETH
5. There's also an independent function to withdraw all ETH and ERC20 tokens at the contract owner's discretion

Before you start playing with this I highly recommend to have a read of the [Aave Flash Loan mechanism](https://aave.com/flash-loans) and get an indepth conceptual understanding, as it's equally important as understanding the code.

Since Sushiswap is a fork of UniswapV2, I also suggest familiarising yourself with the Uniswap V2 guide on [trading via smart contracts](https://uniswap.org/docs/v2/smart-contract-integration/trading-from-a-smart-contract/), particularly if you plan on adding more swaps to your arbitrage strategy.


## Deployment

The contract can be deployed unto Remix, using solidity compiler 0.6.12, and Metamask using Injected Web3.

On deployment, set the following parameters:

![](https://raw.githubusercontent.com/manuelinfosec/flash-arb-bot/main/images/Deployment.PNG)

- ***_AaveLendingPool:*** the LendingPoolAddressesProvider address corresponding to the deployment environment. see [Deployed Contract Instances](https://docs.aave.com/developers/deployed-contracts/deployed-contract-instances).
- ***_UniswapV2Router:*** the Router02 address for UniswapV2 see [here](https://uniswap.org/docs/v2/smart-contracts/router02/).
- ***_SushiswapV1Router:*** the Router02 address for SushiswapV1. There isn't an official testnet router02 so for demo purposes you can just use the uniswapV2 address when playing on the testnet since their codebase is identical (for now - which may not be the case in the future). Alternatively see [Sushiswap repo](https://github.com/sushiswap/sushiswap) for the mainnet router02 address to test in prod or deploy your own version of Router02 onto testnet.
- Click 'transact' and approve the Metamask pop up.
- Once the flash arb contract is deployed, send some ETH or ERC20 token to this contract depending on what asset you're planning to flash borrow from Aave in case you need extra funds to cover the flash fee.


## Execution

On execution, set the following parameters:

![](https://raw.githubusercontent.com/manuelinfosec/flash-arb-bot/main/images/Execution.PNG)

- ***_flashAsset:*** address of the asset you want to flash loan. e.g. ETH is 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE. If you want to flash anything else see [Reserved Assets](https://docs.aave.com/developers/deployed-contracts/deployed-contract-instances#reserves-assets) but you will need to adjust the executeArbitrage() function accordingly.
- ***_flashAmount:*** how much of _flashAsset you want to borrow, demoniated in wei (e.g. 1000000000000000000 for 1 ether).
- ***_daiTokenAddress:*** for this demo we're swapping with the DAI token, so lookup the reserved address of the DAI token. See [Reserved Assets](https://docs.aave.com/developers/deployed-contracts/deployed-contract-instances#reserves-assets).
- ***_amountToTrade:*** how much of the newly acquired _flashAsset you'd like to use as part of this arbitrage.
- ***_tokensOut:*** how much of the ERC20 tokens from the first swap would you like to swap back to complete the arb. Denominated in actual tokens, i.e. 1 = 1 DAI token.
- Click 'transact' and approve in Metamask.



## Result
![](https://raw.githubusercontent.com/manuelinfosec/flash-arb-bot/main/images/TXResult.PNG)

If all goes well, a successful execution of this contract looks like [this (Ropsten testnet)](https://ropsten.etherscan.io/tx/0xc1da19c7a5e189b372ec3b310453d7ee267da5df661ee61833230470e5b97fd8).

## Updates
- Added V2 contract for a more recent deployment.
- Expected to provide more promising results for arbitraging with flash loans.

## Tips for further customization
- This contract would typically be executed by a Web3py bot (beyond this scope) via a web3.eth.Contract() call, referencing the deployed address of this contract and its corresponding ABI. You would usually get the bot to interact with price aggregators such as [1inch](https://1inch.exchange) to assess arb opportunities and execute this contract if the right opportunity is found.
- To have any chance of getting in front of other arbitrage bots on significant arb opportunities the Web3py bot needs to be hosted on your own fast Ethereum node. You will most likely come off second best going through the Infura API to interact with the Ethereum blockchain.
- Some people like to get an unfair advantage by building Transaction-Ordering Dependence (front running) capabilities into the Web3py. However this smart contract would then need to be significantly more complex and flexible enough to cater for a wide range of arbitrage permutations across multiple protocols.
- User specified parameters (as opposed to hardcoded variables) should be passed via the flashloan() function in the first instance. You can subsequently set these parameters to contract variables with higher visibility across the contract.
- There are no direct ETH pairs in UniswapV2 therefore the need for a WETH wrapper. Since Sushiswap is forked from UniswapV2 you'll need to wrap in WETH as well.

## Connect with me
If you appreciate this, leave the repo a star and feel free to follow me on:

[![Manuel Twitter](https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white)](https://twitter.com/manuelinfoec)
[![Chiemezie Njoku Linkedin](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/manuelinfosec/)
[![Manuel Medium](https://img.shields.io/badge/Medium-000000?style=for-the-badge&logo=medium&logoColor=white)](https://manuelinfosec.medium.com/)

## Appreciation
You could also donate:

Ethereum/Binance Smart Chain/Polygon/Avalanche/etc address: 0xE882D838eF07e796bf6b19636931F143e3eC4Dc3
<br /><br />