/* eslint-disable no-undef */
const { ethers } = require("ethers");
const chalk = require("chalk");
// const uniswap = require("@studydefi/money-legos/uniswap");
const erc20 = require("@studydefi/money-legos/erc20");
const { constants } = require('@openzeppelin/test-helpers');

const { ZERO_ADDRESS } = constants;
const { ABIS, BYTECODE, ADDRESSES } = require("../scripts/constants");
const { deployContract, swapEthFor, wallets } = require("../scripts/common");

jest.setTimeout(100000);
let users = [];
let investEthAmount = [];
let investDaiAmount = [];
let ethBalances = [];
let daiBalances = [];
let uniBalances = [];
let fastGasPrice;
let Controller;
let psUNIDAI;
let StrategyUniEthDaiLpV4;

const tempGov = wallets[0].address;
const tempTimelock = wallets[0].address;
const strategist = wallets[1].address;
const devfund = "0x2fee17F575fa65C06F10eA2e63DBBc50730F145D";
const treasury = "0x066419EaEf5DE53cc5da0d8702b990c5bc7D1AB3";
const uniEthDai = "0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11";

// util function
const fromWei = (x) => ethers.utils.formatUnits(x, 18);
const now = parseInt(new Date().getTime() / 1000);

describe("Deploy Pickle Contracts", () => {
  beforeAll(async () => {
    let arr = [];
    for (let i = 0; i < 7; i++) {
      arr.push(wallets[3 + i]);
    }
    users = await Promise.all(arr);
    wallet = await wallets[0];
    Controller = await deployContract({
      name: "ControllerV4",
      abi: ABIS.Pickle.ControllerV4,
      bytecode: BYTECODE.Pickle.ControllerV4,
      args: [tempGov, strategist, tempTimelock, devfund, treasury]
    });
  });

  const setJarApproveAndSetStrategy = async (jar, strat) => {
    const gasPrice = await wallet.provider.getGasPrice();
    fastGasPrice = gasPrice.mul(ethers.BigNumber.from(125)).div(ethers.BigNumber.from(100));
    const want = await strat.want();

    let tx = await Controller.setJar(want, jar.address, {
      gasLimit: 1000000,
      gasPrice: fastGasPrice,
    });
    await tx.wait();
  
    tx = await Controller.approveStrategy(want, strat.address, {
      gasLimit: 1000000,
      gasPrice: fastGasPrice,
    });
    await tx.wait();

    tx = await Controller.setStrategy(want, strat.address, {
      gasLimit: 1000000,
      gasPrice: fastGasPrice,
    });
    await tx.wait();
  
    // Make sure jar is set
    const controllerJar = await Controller.jars(want);
    if (controllerJar.toLowerCase() !== jar.address.toLowerCase()) {
      console.log(
        chalk.red(`Invalid jar, expected: ${jar.address}, got ${controllerJar}`)
      );
    }
  
    const controllerStrat = await Controller.strategies(want);
    if (controllerStrat.toLowerCase() !== strat.address.toLowerCase()) {
      console.log(
        chalk.red(
          `Invalid strategy, expected: ${strat.address}, got ${controllerStrat}`
        )
      );
    }
  };

  test("Deploy psUNIDAI + its Strategy AND Approve them", async () => {
    psUNIDAI = await deployContract({
      name: "psUNIDAI",
      abi: ABIS.Pickle.PickleJar,
      bytecode: BYTECODE.Pickle.PickleJar,
      args: [uniEthDai, tempGov, tempTimelock, Controller.address]
    });
    StrategyUniEthDaiLpV4 = await deployContract({
      name: "StrategyUniEthDaiLpV4",
      abi: ABIS.Pickle.Strategies.StrategyUniEthDaiLpV4,
      bytecode: BYTECODE.Pickle.Strategies.StrategyUniEthDaiLpV4,
      args: [tempGov, strategist, Controller.address, tempTimelock]
    });
    await setJarApproveAndSetStrategy(psUNIDAI, StrategyUniEthDaiLpV4);
    expect(psUNIDAI.address).not.toBe(ZERO_ADDRESS);
    expect(StrategyUniEthDaiLpV4.address).not.toBe(ZERO_ADDRESS);
  });
});

for(let i = 0; i < 7; i++) {
describe(`Test User ${i} investing DAI/ETH on UniSwap and Pickles Jar`, () => {
  beforeAll(async () => {
    daiContract = new ethers.Contract(
      ADDRESSES.ERC20.DAI,
      erc20.dai.abi,
      users[i],
    );
    uniswapRouter = new ethers.Contract(
      ADDRESSES.UniswapV2.Router2,
      ABIS.UniswapV2.Router2,
      users[i],
    );
    psUNIDAIContract = new ethers.Contract(
      psUNIDAI.address,
      ABIS.Pickle.PickleJar,
      users[i],
    );
    uniswapPair = new ethers.Contract(
      uniEthDai,
      ABIS.UniswapV2.Pair,
      users[i],
    );
  });

  test("Buy DAI tokens", async () => {
    await swapEthFor(ethers.utils.parseEther("100"), ADDRESSES.ERC20.DAI, users[i]);
    daiBalances[i] = await daiContract.balanceOf(users[i].address);
    const daiBalance = parseFloat(fromWei(daiBalances[i]));
    expect(daiBalance).toBeGreaterThan(0);
  });

  test("Approve Uniswap for DAI tokens", async () => {
    await daiContract.approve(ADDRESSES.UniswapV2.Router2, daiBalances[i]);
    const allowanceWei = await daiContract.allowance(users[i].address, ADDRESSES.UniswapV2.Router2);
    const allowance = parseFloat(fromWei(allowanceWei));
    expect(allowance).toBe(parseFloat(fromWei(daiBalances[i])));
  });
  
  test("Add Eth/DAI liquidity to Uniswap", async () => {
    investDaiAmount[i] = daiBalances[i].sub(ethers.utils.parseUnits("200", 18));
    ethBalances[i] = await users[i].getBalance();
    const ethDaiPrice = await uniswapRouter.getAmountsIn(investDaiAmount[i], [ADDRESSES.ERC20.WETH, ADDRESSES.ERC20.DAI]);
    investEthAmount[i] = ethDaiPrice[0]; 
    const daiAmount = ethDaiPrice[1]; 
    const ethRange = investEthAmount[i].sub(ethers.utils.parseUnits("1", 18));
    const daiRange = daiAmount.sub(ethers.utils.parseUnits("200", 18));
    
    await uniswapRouter.addLiquidityETH(
      daiContract.address,
      daiAmount,
      daiRange,
      ethRange,
      users[i].address,
      now + 420,
      { 
        value: investEthAmount[i],
        gasLimit: 10000000,
        gasPrice: fastGasPrice,
      }
    );  

    const daiBalanceAfter = await daiContract.balanceOf(users[i].address);
    const daiBalance = parseFloat(fromWei(daiBalanceAfter));
    console.log(chalk.yellow(
      `[User ${i}] ADD LIQUIDITY TO UNISWAP::  DAI BEFORE: ${parseFloat(fromWei(daiBalances[i]))}, DAI AFTER: ${daiBalance}`
    ));
    expect(parseFloat(fromWei(daiBalances[i]))).toBeGreaterThan(daiBalance);
  });

  test("Check User got LP tokens", async () => {
    uniBalances[i] = await uniswapPair.balanceOf(users[i].address);
    console.log(chalk.blue(`[User ${i}] uniLP TOKENS: ${parseFloat(fromWei(uniBalances[i]))}`));
    expect(parseFloat(fromWei(uniBalances[i]))).toBeGreaterThan(0);
  });

  test("Deposit uniLP tokens into Pickles EthDai Jar", async () => {
    const pDAIBalanceBefore = await psUNIDAIContract.balanceOf(users[i].address);
    //Approve Tokens
    await uniswapPair.approve(psUNIDAIContract.address, uniBalances[i]);
    //Deposit into pickles jar
    await psUNIDAIContract.deposit(uniBalances[i], {
      gasLimit: 1000000,
      gasPrice: fastGasPrice,
    });
    
    const pDAIBalanceAfter = await psUNIDAIContract.balanceOf(users[i].address);
    console.log(chalk.yellow(
      `[User ${i}] Deposit tokens in ETHDAI Jar:: pDAI Balance Before: ${parseFloat(fromWei(pDAIBalanceBefore))}, 
      pDAI Balance After: ${parseFloat(fromWei(pDAIBalanceAfter))}`
    ));
    expect(parseFloat(fromWei(pDAIBalanceAfter))).toBeGreaterThan(parseFloat(fromWei(pDAIBalanceBefore)));
  });
});
}

for(let i = 0; i < 7; i++) {
  describe(`Test User ${i} Withdrawl`, () => {
    test("withdraw uniLP tokens from Pickles EthDai Jar", async () => {
      const pDAIBalance = await psUNIDAIContract.balanceOf(users[i].address);
      await psUNIDAIContract.connect(users[i]).withdraw(pDAIBalance, {
        gasLimit: 1000000,
        gasPrice: fastGasPrice,
      });
  
      uniBalances[i] = await uniswapPair.balanceOf(users[i].address);
      console.log(chalk.yellow(
        `[User ${i}] Withdraw from pickle:: uniTokens: ${parseFloat(fromWei(uniBalances[i]))}`
      ));
      expect(parseFloat(fromWei(uniBalances[i]))).toBeGreaterThan(0);
    });

    test("withdraw DAI&ETH from Uniswap", async () => {
      const tx1 = await uniswapPair.connect(users[i]).approve(uniswapRouter.address, uniBalances[i]);
      await tx1.wait();
      const ethBalanceBefore = await users[i].getBalance();
      await uniswapRouter.connect(users[i]).removeLiquidityETH(
        daiContract.address,
        uniBalances[i],
        0,
        0,
        users[i].address,
        now + 420,
        { 
          gasLimit: 1000000,
          gasPrice: fastGasPrice,
        }
      );  
      const uniToken = await uniswapPair.balanceOf(users[i].address);
      console.log(chalk.cyan(`[User ${i}] withdraw from Uniswap:: uniTokensAfterWithdraw = ${parseFloat(fromWei(uniToken))}`));
      const daiBalanceAfter = await daiContract.balanceOf(users[i].address);
      const ethBalanceAfter = await users[i].getBalance();
      console.log(chalk.greenBright(
        `[User ${i}] withdraw from Uniswap:: DAI Balance Before: ${parseFloat(fromWei(daiBalances[i]))}, 
        DAI Balance After: ${parseFloat(fromWei(daiBalanceAfter))}`
      ));
      console.log(chalk.greenBright(
        `[User ${i}] withdraw from Uniswap:: Eth After= ${parseFloat(fromWei(ethBalanceAfter))}, Eth Before= ${parseFloat(fromWei(ethBalances[i]))}
        invested ether= ${parseFloat(fromWei(investEthAmount[i]))}`
      ));
      expect(parseFloat(fromWei(ethBalanceAfter))).toBeGreaterThan(parseFloat(fromWei(ethBalanceBefore)));
    });
  });
}