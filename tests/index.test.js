const { ethers } = require("ethers");

const PRIV_KEY = "";

const startChain = async () => {
  const provider = new ethers.providers.JsonRpcProvider();
  const wallet = new ethers.Wallet(PRIV_KEY, provider);

  return wallet;
};

jest.setTimeout(100000);
const uniswap = require("@studydefi/money-legos/uniswap");
const erc20 = require("@studydefi/money-legos/erc20");

describe("do some tests", () => {
  let wallet;

  beforeAll(async () => {
    wallet = await startChain();
  });

  test("initial DAI balance of 0", async () => {
    const daiContract = new ethers.Contract(
      erc20.dai.address,
      erc20.dai.abi,
      wallet,
    );
    console.log(erc20.dai.address);
    const daiBalanceWei = await daiContract.balanceOf(wallet.address)
    const daiBalance = ethers.utils.formatUnits(daiBalanceWei, 18)
    expect(parseFloat(daiBalance)).toBe(0)
  });

  test("buy DAI from Uniswap", async () => {
    // 1. instantiate contracts
    const daiContract = new ethers.Contract(
      erc20.dai.address,
      erc20.dai.abi,
      wallet,
    );
    const uniswapFactoryContract = new ethers.Contract(
      uniswap.factory.address,
      uniswap.factory.abi,
      wallet,
    );
    const daiExchangeAddress = await uniswapFactoryContract.getExchange(
      erc20.dai.address,
    );
    const daiExchangeContract = new ethers.Contract(
      daiExchangeAddress,
      uniswap.exchange.abi,
      wallet,
    );

    // 2. do the actual swapping
    await daiExchangeContract.ethToTokenSwapInput(
      1, // min amount of token retrieved
      2525644800, // random timestamp in the future (year 2050)
      {
        gasLimit: 4000000,
        value: ethers.utils.parseEther("5"),
      },
    );

    // util function
    const fromWei = (x) => ethers.utils.formatUnits(x, 18);

    // 3. check DAI balance
    const daiBalanceWei = await daiContract.balanceOf(wallet.address);
    const daiBalance = parseFloat(fromWei(daiBalanceWei));
    expect(daiBalance).toBeGreaterThan(0);
  });
});
