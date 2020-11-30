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
let fastGasPrice;
let Controller;
let psUNIDAI;
let StrategyUniEthDaiLpV4;
let LPTokens;

const tempGov = wallets[0].address;
const tempTimelock = wallets[0].address;
const strategist = wallets[1].address;
const devfund = "0x2fee17F575fa65C06F10eA2e63DBBc50730F145D";
const treasury = "0x066419EaEf5DE53cc5da0d8702b990c5bc7D1AB3";
const uniEthDai = "0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11";

// util function
const fromWei = (x) => ethers.utils.formatUnits(x, 18);
const now = parseInt(new Date().getTime() / 1000);

describe("Test ControllerV4 Contract", () => {
  beforeAll(async () => {
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

describe("Test Users investing DAI/ETH on UniSwap and Pickles", () => {
  beforeAll(async () => {
    let arr = [];
    for (let i = 0; i < 7; i++) {
      arr.push(wallets[3 + i]);
    }
    users = await Promise.all(arr);
    daiContract = new ethers.Contract(
      ADDRESSES.ERC20.DAI,
      erc20.dai.abi,
      users[0],
    );
    uniswapRouter = new ethers.Contract(
      ADDRESSES.UniswapV2.Router2,
      ABIS.UniswapV2.Router2,
      users[0],
    );
    psUNIDAIContract = new ethers.Contract(
      psUNIDAI.address,
      ABIS.Pickle.PickleJar,
      users[0],
    );
    uniswapPair = new ethers.Contract(
      uniEthDai,
      ABIS.UniswapV2.Pair,
      users[0],
    );
  });

  test("Buy DAI tokens", async () => {
    let daiBefore = await daiContract.balanceOf(users[0].address);
    daiBefore = parseFloat(fromWei(daiBefore));

    let swaps = [];
    for (let index = 0; index < 7; index++) {
      swaps.push(swapEthFor(ethers.utils.parseEther("100"), ADDRESSES.ERC20.DAI, users[index]));
    }
    await Promise.all(swaps);

    daiBalanceWei = await daiContract.balanceOf(users[0].address);
    const daiBalance = parseFloat(fromWei(daiBalanceWei));
    console.log(chalk.yellowBright(`Buy DAI tokes:: DAI BalanceAfter: ${daiBalance}`));
    expect(daiBalance).toBeGreaterThan(daiBefore);
  });

  test("Approve Uniswap for DAI tokens", async () => {
    let approves = [];
    for (let index = 0; index < 7; index++) {
      approves.push(daiContract.connect(users[index]).approve(ADDRESSES.UniswapV2.Router2, daiBalanceWei));
    }
    await Promise.all(approves);
    const allowanceWei = await daiContract.connect(users[2]).allowance(users[2].address, ADDRESSES.UniswapV2.Router2);
    expect(parseFloat(fromWei(allowanceWei))).toBeGreaterThanOrEqual(parseFloat(fromWei(daiBalanceWei)));
  });
  
  test("Add Eth/DAI liquidity to Uniswap", async () => {
    let addliquiditys = [];
    let investDaiAmount = daiBalanceWei.sub(ethers.utils.parseUnits("200", 18));
    for (let index = 2; index < 3; index++) {
      addliquiditys.push((async () => {
        const ethDaiPrice = await uniswapRouter.getAmountsIn(investDaiAmount, [ADDRESSES.ERC20.WETH, ADDRESSES.ERC20.DAI]);    
        const ethAmount = ethDaiPrice[0]; 
        const daiAmount = ethDaiPrice[1]; 
        const ethRange = ethAmount.sub(ethers.utils.parseUnits("1", 18));
        const daiRange = daiAmount.sub(ethers.utils.parseUnits("200", 18));
        console.log(chalk.yellow(`ethAmount: ${parseFloat(fromWei(ethAmount))}, daiAmount: ${parseFloat(fromWei(daiAmount))}, for user ${index}`));
        await uniswapRouter.connect(users[index]).addLiquidityETH(
          daiContract.address,
          daiAmount,
          daiRange,
          ethRange,
          users[index].address,
          now + 420,
          { 
            value: ethAmount.add(ethers.utils.parseUnits("1", 18)),
            gasLimit: 10000000,
            gasPrice: fastGasPrice,
          }
        );
      })());
    }
    await Promise.all(addliquiditys);
    const daiBalanceAfter = await daiContract.balanceOf(users[2].address);
    const daiBalance = parseFloat(fromWei(daiBalanceAfter));
    console.log(chalk.yellow(`add Liquidity to uniswap:: DAI BEFORE: ${parseFloat(fromWei(daiBalanceWei))}, DAI AFTER: ${daiBalance}`));
    expect(parseFloat(fromWei(daiBalanceWei))).toBeGreaterThan(daiBalance);
  });

  // test("Check User got LP tokens", async () => {
  //   LPTokens = await uniswapPair.balanceOf(user1.address);
  //   console.log(chalk.blue("uniLP TOKENS:", parseFloat(fromWei(LPTokens))));
  //   expect(parseFloat(fromWei(LPTokens))).toBeGreaterThan(0);
  // });

  // test("Deposit uniLP tokens into Pickles EthDai Jar", async () => {
  //   const pDAIBalanceBefore = await psUNIDAIContract.balanceOf(user1.address);
  //   //Approve Tokens
  //   let tx1 = await uniswapPair.approve(psUNIDAIContract.address, LPTokens);
  //   await tx1.wait();
  //   //Deposit into pickles jar
  //   let tx2 = await psUNIDAIContract.deposit(LPTokens, {
  //     gasLimit: 1000000,
  //     gasPrice: fastGasPrice,
  //   });
  //   await tx2.wait();
    
  //   const pDAIBalanceAfter = await psUNIDAIContract.balanceOf(user1.address);
  //   console.log(chalk.yellow(
  //     `pDAI Balance Before: ${parseFloat(fromWei(pDAIBalanceBefore))},  pDAI Balance After: ${parseFloat(fromWei(pDAIBalanceAfter))}`
  //   ));
  //   expect(parseFloat(fromWei(pDAIBalanceAfter))).toBeGreaterThan(parseFloat(fromWei(pDAIBalanceBefore)));
  // });

  // test("Test pickles jar get ratio", async () => {
  //   const ratio = await psUNIDAIContract.getRatio();
  //   console.log(chalk.greenBright(ratio));
  // });

  // test("withdraw uniLP tokens from Pickles EthDai Jar", async () => {
  //   const pDAIBalance = await psUNIDAIContract.balanceOf(user1.address);
  //   let tx1 = await psUNIDAIContract.withdraw(pDAIBalance, {
  //     gasLimit: 1000000,
  //     gasPrice: fastGasPrice,
  //   });
  //   await tx1.wait();

  //   const LPTokensAfter = await uniswapPair.balanceOf(user1.address);
  //   console.log(chalk.yellow(
  //     `uniTokens after withdrawl: ${parseFloat(fromWei(LPTokensAfter))}`
  //   ));
  //   expect(parseFloat(fromWei(LPTokensAfter))).toBeGreaterThanOrEqual(parseFloat(fromWei(LPTokens)));
  // });
});
