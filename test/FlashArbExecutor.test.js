const { expect } = require("chai");
const { ethers } = require("hardhat");

const DEX_KIND = { V2: 0, V3: 1 };
const RATE_1_TO_1 = ethers.parseEther("1"); // 1e18 fixed-point scale used by MockRouter

describe("FlashArbExecutor", function () {
  async function deployFixture() {
    const [owner, other] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const borrowToken = await MockERC20.deploy("Borrow Token", "BOR");
    const midToken = await MockERC20.deploy("Intermediate Token", "MID");

    const MockPool = await ethers.getContractFactory("MockPool");
    const pool = await MockPool.deploy();

    const MockPoolAddressesProvider = await ethers.getContractFactory("MockPoolAddressesProvider");
    const addressesProvider = await MockPoolAddressesProvider.deploy(await pool.getAddress());

    const FlashArbExecutor = await ethers.getContractFactory("FlashArbExecutor");
    const executor = await FlashArbExecutor.deploy(await addressesProvider.getAddress(), owner.address);

    const MockRouter = await ethers.getContractFactory("MockRouter");
    const routerA = await MockRouter.deploy(); // leg1: BOR -> MID (V2-style)
    const routerB = await MockRouter.deploy(); // leg2: MID -> BOR (V3-style)

    // Give the mock pool enough liquidity to fund the flash loan.
    await borrowToken.mint(await pool.getAddress(), ethers.parseEther("1000000"));

    return { owner, other, borrowToken, midToken, pool, addressesProvider, executor, routerA, routerB };
  }

  function buildParams({ routerA, routerB, midToken, minProfit, deadline }) {
    return {
      leg1: {
        kind: DEX_KIND.V2,
        router: routerA,
        tokenOut: midToken,
        v3Fee: 0,
        minAmountOut: 0n,
      },
      leg2: {
        kind: DEX_KIND.V3,
        router: routerB,
        tokenOut: undefined, // filled by caller (borrowToken address)
        v3Fee: 3000,
        minAmountOut: 0n,
      },
      minProfit,
      deadline,
    };
  }

  it("executes a profitable round trip and forwards the surplus to the owner", async function () {
    const { owner, borrowToken, midToken, executor, routerA, routerB } = await deployFixture();

    const borrowAddr = await borrowToken.getAddress();
    const midAddr = await midToken.getAddress();

    // BOR -> MID at 1:1, then MID -> BOR at 1.02:1 -> a 2% round trip, well above the 0.05% fee.
    await routerA.setRate(borrowAddr, midAddr, RATE_1_TO_1);
    await routerB.setRate(midAddr, borrowAddr, ethers.parseEther("1.02"));

    const amount = ethers.parseEther("1000");
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;

    const params = buildParams({
      routerA: await routerA.getAddress(),
      routerB: await routerB.getAddress(),
      midToken: midAddr,
      minProfit: ethers.parseEther("1"), // require at least 1 BOR of net profit
      deadline,
    });
    params.leg2.tokenOut = borrowAddr;

    const ownerBalanceBefore = await borrowToken.balanceOf(owner.address);

    const premiumBps = await (await ethers.getContractAt("MockPool", await executor.POOL())).premiumBps();
    const premium = (amount * premiumBps) / 10000n;
    const expectedFinalOut = (amount * ethers.parseEther("1.02")) / RATE_1_TO_1; // net of the 1:1 -> 1.02:1 legs
    const expectedProfit = expectedFinalOut - (amount + premium);

    await expect(executor.startArbitrage(borrowAddr, amount, params))
      .to.emit(executor, "ArbitrageExecuted")
      .withArgs(await executor.getAddress(), borrowAddr, amount, premium, expectedProfit);

    const ownerBalanceAfter = await borrowToken.balanceOf(owner.address);
    expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(expectedProfit);
    expect(await borrowToken.balanceOf(await executor.getAddress())).to.equal(0);
  });

  it("reverts the whole flash loan when the round trip is not profitable enough", async function () {
    const { borrowToken, midToken, executor, routerA, routerB } = await deployFixture();

    const borrowAddr = await borrowToken.getAddress();
    const midAddr = await midToken.getAddress();

    // Round trip loses value: 1:1 out, 0.999:1 back -> can never cover the flash loan premium.
    await routerA.setRate(borrowAddr, midAddr, RATE_1_TO_1);
    await routerB.setRate(midAddr, borrowAddr, ethers.parseEther("0.999"));

    const amount = ethers.parseEther("1000");
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;

    const params = buildParams({
      routerA: await routerA.getAddress(),
      routerB: await routerB.getAddress(),
      midToken: midAddr,
      minProfit: 0n,
      deadline,
    });
    params.leg2.tokenOut = borrowAddr;

    await expect(executor.startArbitrage(borrowAddr, amount, params)).to.be.revertedWith("NOT_PROFITABLE");
  });

  it("only lets the owner start an arbitrage", async function () {
    const { other, borrowToken, midToken, executor, routerA, routerB } = await deployFixture();

    const borrowAddr = await borrowToken.getAddress();
    const midAddr = await midToken.getAddress();

    const params = buildParams({
      routerA: await routerA.getAddress(),
      routerB: await routerB.getAddress(),
      midToken: midAddr,
      minProfit: 0n,
      deadline: (await ethers.provider.getBlock("latest")).timestamp + 3600,
    });
    params.leg2.tokenOut = borrowAddr;

    await expect(
      executor.connect(other).startArbitrage(borrowAddr, ethers.parseEther("1"), params)
    ).to.be.revertedWithCustomError(executor, "OwnableUnauthorizedAccount");
  });

  it("lets the owner sweep stray ERC20 balances", async function () {
    const { owner, borrowToken, executor } = await deployFixture();

    await borrowToken.mint(await executor.getAddress(), ethers.parseEther("5"));
    const before = await borrowToken.balanceOf(owner.address);

    await executor.sweepToken(await borrowToken.getAddress(), owner.address);

    expect(await borrowToken.balanceOf(owner.address)).to.equal(before + ethers.parseEther("5"));
    expect(await borrowToken.balanceOf(await executor.getAddress())).to.equal(0);
  });
});
