const { ethers } = require("ethers");
const chalk = require("chalk");
const uniswap = require("@studydefi/money-legos/uniswap");
const erc20 = require("@studydefi/money-legos/erc20");

const { ABIS, BYTECODE, KEYS } = require("../scripts/constants");
const { deployContract, provider, wallets } = require("../scripts/common");

jest.setTimeout(100000);

describe("Test ControllerV4 Contract", () => {
  let wallet;
  let Controller;

  const tempGov = wallets[0].address;
  const tempTimelock = wallets[0].address;
  const strategist = wallets[1].address;
  const devfund = "0x2fee17F575fa65C06F10eA2e63DBBc50730F145D";
  const treasury = "0x066419EaEf5DE53cc5da0d8702b990c5bc7D1AB3";

  beforeAll(async () => {
    wallet = await wallets[0];
    Controller = await deployContract({
      name: "ControllerV4",
      abi: ABIS.Pickle.ControllerV4,
      bytecode: BYTECODE.Pickle.ControllerV4,
      args: [tempGov, strategist, tempTimelock, devfund, treasury]
    });
  });

  test("check governance address", async () => {
    const governance = await Controller.governance();
    console.log(governance);
    expect(governance).toBe(tempGov);
  });

  // test("buy DAI from Uniswap", async () => {
  //   // 1. instantiate contracts
  //   const daiContract = new ethers.Contract(
  //     erc20.dai.address,
  //     erc20.dai.abi,
  //     wallet,
  //   );
  //   const uniswapFactoryContract = new ethers.Contract(
  //     uniswap.factory.address,
  //     uniswap.factory.abi,
  //     wallet,
  //   );
  //   const daiExchangeAddress = await uniswapFactoryContract.getExchange(
  //     erc20.dai.address,
  //   );
  //   const daiExchangeContract = new ethers.Contract(
  //     daiExchangeAddress,
  //     uniswap.exchange.abi,
  //     wallet,
  //   );

  //   // 2. do the actual swapping
  //   await daiExchangeContract.ethToTokenSwapInput(
  //     1, // min amount of token retrieved
  //     2525644800, // random timestamp in the future (year 2050)
  //     {
  //       gasLimit: 4000000,
  //       value: ethers.utils.parseEther("5"),
  //     },
  //   );

  //   // util function
  //   const fromWei = (x) => ethers.utils.formatUnits(x, 18);

  //   // 3. check DAI balance
  //   const daiBalanceWei = await daiContract.balanceOf(wallet.address);
  //   const daiBalance = parseFloat(fromWei(daiBalanceWei));
  //   expect(daiBalance).toBeGreaterThan(0);
  // });
});
