/* eslint-disable no-undef */
const { ethers } = require("ethers");
const chalk = require("chalk");
// const uniswap = require("@studydefi/money-legos/uniswap");
const erc20 = require("@studydefi/money-legos/erc20");
const { constants, time } = require('@openzeppelin/test-helpers');

const { ZERO_ADDRESS } = constants;
const { ABIS, BYTECODE, ADDRESSES } = require("../scripts/constants");
const { deployContract, swapEthFor, wallets, provider } = require("../scripts/common");

jest.setTimeout(100000);
let fastGasPrice;
let Controller;
let lUNIDAI;
let StrategyUniEthDaiLpV4;
let LPTokens;
let currentBlock;

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

//   test("valid governance address", async () => {
//     const contGovernance = await Controller.governance();
//     expect(contGovernance).toBe(tempGov);
//   });

//   test("valid strategist address", async () => {
//     const contStrategist = await Controller.strategist();
//     expect(contStrategist).toBe(strategist);
//   });

//   test("valid timeLock address", async () => {
//     const contTimeLock = await Controller.timelock();
//     expect(contTimeLock).toBe(tempTimelock);
//   });

//   test("valid devFund address", async () => {
//     const contDEvFund = await Controller.devfund();
//     expect(contDEvFund).toBe(devfund);
//   });

//   test("valid treasury address", async () => {
//     const contTreasury = await Controller.treasury();
//     expect(contTreasury).toBe(treasury);
//   });

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

  test("Deploy lUNIDAI + its Strategy AND Approve them", async () => {
    lUNIDAI = await deployContract({
      name: "lUNIDAI",
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
    await setJarApproveAndSetStrategy(lUNIDAI, StrategyUniEthDaiLpV4);
    expect(lUNIDAI.address).not.toBe(ZERO_ADDRESS);
    expect(StrategyUniEthDaiLpV4.address).not.toBe(ZERO_ADDRESS);
  });
});

describe("Test User investing DAI/ETH on UniSwap and Pickles Jars", () => {
  beforeAll(async () => {
    user1 = await wallets[9];
    daiContract = new ethers.Contract(
      ADDRESSES.ERC20.DAI,
      erc20.dai.abi,
      user1,
    );
    uniswapRouter = new ethers.Contract(
      ADDRESSES.UniswapV2.Router2,
      ABIS.UniswapV2.Router2,
      user1,
    );
    lUNIDAIContract = new ethers.Contract(
      lUNIDAI.address,
      ABIS.Pickle.PickleJar,
      user1,
    );
    uniswapPair = new ethers.Contract(
      uniEthDai,
      ABIS.UniswapV2.Pair,
      user1,
    );
  });

  test("Buy DAI tokens", async () => {
    const ethBalanceBefore = await user1.getBalance();
    const daiWeiBefore = await daiContract.balanceOf(user1.address);
    const daiBefore = parseFloat(fromWei(daiWeiBefore));
    console.log(chalk.yellowBright(`DAI BalanceBefore: ${daiBefore}, `, `Eth Balance Before: ${ethBalanceBefore}`));

    await swapEthFor(ethers.utils.parseEther("10"), ADDRESSES.ERC20.DAI, user1);
    const ethBalanceAfter = await user1.getBalance();
    const daiBalanceWei = await daiContract.balanceOf(user1.address);
    const daiBalance = parseFloat(fromWei(daiBalanceWei));
    console.log(chalk.yellowBright(`DAI BalanceAfter: ${daiBalance}, `, `Eth BalanceAfter: ${ethBalanceAfter}`));

    expect(daiBalance).toBeGreaterThan(daiBefore);
  });

  test("Approve Uniswap for DAI tokens", async () => {
    let tx = await daiContract.approve(ADDRESSES.UniswapV2.Router2, ethers.utils.parseEther("1000"));
    await tx.wait();
    const allowanceWei = await daiContract.allowance(user1.address, ADDRESSES.UniswapV2.Router2);
    const allowance = parseFloat(fromWei(allowanceWei));
    expect(allowance).toBeGreaterThan(0);
  });
  
  test("Add Eth/DAI liquidity to Uniswap", async () => {
    const daiBeforeeWei = await daiContract.balanceOf(user1.address);
    const daiBefore = parseFloat(fromWei(daiBeforeeWei));

    const ethDaiPrice = await uniswapRouter.getAmountsIn(ethers.utils.parseEther("500"), [ADDRESSES.ERC20.WETH, ADDRESSES.ERC20.DAI]);
    const ethAmount = ethDaiPrice[0]; 
    const daiAmount = ethDaiPrice[1]; 
    const ethRange = ethAmount.sub(ethers.utils.parseUnits("1", 16));
    const daiRange = daiAmount.sub(ethers.utils.parseUnits("2", 18));
    console.log(chalk.yellow(`ethAmount: ${ethAmount}, daiAmount: ${daiAmount}`));
    
    let tx = await uniswapRouter.addLiquidityETH(
      daiContract.address,
      daiAmount,
      daiRange,
      ethRange,
      user1.address,
      now + 420,
      { 
        value: ethAmount,
        gasLimit: 10000000,
        gasPrice: fastGasPrice,
      }
    );
    await tx.wait();

    const daiBalanceWei = await daiContract.balanceOf(user1.address);
    const daiBalance = parseFloat(fromWei(daiBalanceWei));
    console.log(chalk.yellow(`DAI BEFORE: ${daiBefore}, DAI AFTER: ${daiBalance}`));
    expect(daiBefore).toBeGreaterThan(daiBalance);
  });

  test("Check User got LP tokens", async () => {
    LPTokens = await uniswapPair.balanceOf(user1.address);
    console.log(chalk.blue("uniLP TOKENS:", parseFloat(fromWei(LPTokens))));
    expect(parseFloat(fromWei(LPTokens))).toBeGreaterThan(0);
  });

  test("Deposit uniLP tokens into Pickles EthDai Jar", async () => {
    const pDAIBalanceBefore = await lUNIDAIContract.balanceOf(user1.address);
    //Approve Tokens
    let tx1 = await uniswapPair.approve(lUNIDAIContract.address, LPTokens);
    await tx1.wait();
    //Deposit into pickles jar
    let tx2 = await lUNIDAIContract.deposit(LPTokens, {
      gasLimit: 1000000,
      gasPrice: fastGasPrice,
    });
    await tx2.wait();
    
    const pDAIBalanceAfter = await lUNIDAIContract.balanceOf(user1.address);
    console.log(chalk.yellow(
      `pDAI Balance Before: ${parseFloat(fromWei(pDAIBalanceBefore))},  pDAI Balance After: ${parseFloat(fromWei(pDAIBalanceAfter))}`
    ));
    expect(parseFloat(fromWei(pDAIBalanceAfter))).toBeGreaterThan(parseFloat(fromWei(pDAIBalanceBefore)));
  });

  test("Test pickles jar get ratio", async () => {
    const ratio = await lUNIDAIContract.getRatio();
    console.log(chalk.greenBright(ratio));
  });

  // test("Admin call earn", async () => {
  //   const jarBalanceBefore = await uniswapPair.balanceOf(lUNIDAI.address);
  //   await lUNIDAIContract.connect(wallet).earn();
  //   const jarBalanceAfter = await uniswapPair.balanceOf(lUNIDAI.address);
  //   console.log(chalk.blueBright(
  //     `Admin call earn:: Jar Balance Before ${parseFloat(fromWei(jarBalanceBefore))},
  //     Jar Balance After: ${parseFloat(fromWei(jarBalanceAfter))}`
  //   ));
  //   expect(parseFloat(fromWei(jarBalanceBefore))).toBeGreaterThanOrEqual(parseFloat(fromWei(jarBalanceAfter)));
  // });  

  // test("Admin call harvest", async () => {
  //   const uniBalanceBefore = await lUNIDAIContract.balance();
  //   let tx = await StrategyUniEthDaiLpV4.harvest();
  //   await tx.wait();
  //   const uniBalanceAfter = await lUNIDAIContract.balance();
  //   console.log(chalk.blueBright(
  //     `Admin call harvest:: Jar Balance Before ${parseFloat(fromWei(uniBalanceBefore))},
  //     Jar Balance After: ${parseFloat(fromWei(uniBalanceAfter))}`
  //   ));
  //   expect(parseFloat(fromWei(uniBalanceAfter))).toBeGreaterThanOrEqual(parseFloat(fromWei(uniBalanceBefore)));
  // });  

  // test("withdraw uniLP tokens from Pickles EthDai Jar", async () => {
  //   let tx1 = await lUNIDAIContract.withdrawAll();
  //   await tx1.wait();

  //   const LPTokensAfter = await uniswapPair.balanceOf(user1.address);
  //   console.log(chalk.yellow(
  //     `uniTokens after withdrawl: ${parseFloat(fromWei(LPTokensAfter))}`
  //   ));
  //   // expect(parseFloat(fromWei(LPTokensAfter))).toBeGreaterThanOrEqual(parseFloat(fromWei(LPTokens)));
  // });
});

describe("Test pUniDai farm", () => {
  let pDAIBalanceBefore;
  let gasPrice;
  let fastGasPrice;

  beforeAll(async () => {
    LCNToken = await deployContract({
      name: "LCNToken",
      abi: ABIS.LCNToken,
      bytecode: BYTECODE.LCNToken,
      args: []
    });

    currentBlock = await provider.getBlockNumber();
    masterchef = await deployContract({
      name: "masterchef",
      abi: ABIS.Masterchef,
      bytecode: BYTECODE.Masterchef,
      args: [LCNToken.address, wallet.address, 100, currentBlock, currentBlock+100]
    });
  });

  test("Contract:: LCN tokens total supply", async () => {
    const totalSupply = await LCNToken.totalSupply();
    expect(parseFloat(fromWei(totalSupply))).toBe(0);
  });

  test("Contract:: LCNs per block are 100", async () => {
    const LCNPerBlock = await masterchef.LCNPerBlock();
    expect(parseInt(LCNPerBlock)).toBe(100);
  });

  test("Renounce LCN ownership to masterchef", async () => {
    await LCNToken.transferOwnership(masterchef.address);
    const owner = await LCNToken.owner();
    expect(owner).toBe(masterchef.address);
  });

  test("Admin add Farm for lUNIDAI", async () => {
    await masterchef.add(10, lUNIDAIContract.address, false);
    const poolLen = await masterchef.poolLength();
    expect(parseInt(poolLen)).toBe(1);
  });

  test("User deposit lUNIDAI in Farm", async () => {
    pDAIBalanceBefore = await lUNIDAIContract.balanceOf(user1.address);

    let tx1 = await lUNIDAIContract.approve(masterchef.address, pDAIBalanceBefore);
    await tx1.wait();

    await masterchef.connect(user1).deposit(0, pDAIBalanceBefore);

    const pDAIBalanceAfter = await lUNIDAIContract.balanceOf(user1.address);
    console.log(chalk.yellow(
      `Deposit in farm:: pDAI Balance Before: ${parseFloat(fromWei(pDAIBalanceBefore))}
      Deposit in farm:: pDAI Balance After: ${parseFloat(fromWei(pDAIBalanceAfter))}`
    ));
    expect(parseFloat(fromWei(pDAIBalanceBefore))).toBeGreaterThan(parseFloat(fromWei(pDAIBalanceAfter)));
  });

  test("Simulation time passing", async () => {
    const currentBlock = await time.latestBlock();
    let latestBlock = parseInt(currentBlock) + 30;
    console.log(chalk.yellow(
      `Time Simulation:: current block: ${currentBlock}, latest block: ${latestBlock}`
    ));
    await time.advanceBlockTo(latestBlock);
    latestBlock = await time.latestBlock();
    expect(parseInt(latestBlock)).toBeGreaterThan(parseInt(currentBlock));
  });

  test("Check pending LCNs", async () => {
    gasPrice = await wallet.provider.getGasPrice();
    fastGasPrice = gasPrice.mul(ethers.BigNumber.from(125)).div(ethers.BigNumber.from(100));

    await masterchef.connect(wallet).massUpdatePools({
      gasLimit: 1000000,
      gasPrice: fastGasPrice,
    });
    const pendingLCNs = await masterchef.pendingLCN(0, user1.address);
    console.log(chalk.yellow(
      `Farm:: pending LCNs: ${pendingLCNs}`
    ));
  });

  test("Withdraw from farm", async () => {
    let tx1 = await masterchef.connect(user1).withdraw(0, pDAIBalanceBefore, {
      gasLimit: 1000000,
      gasPrice: fastGasPrice,
      from: user1.address
    });
    await tx1.wait();

    const LCNsGained = await LCNToken.balanceOf(user1.address);
    console.log(chalk.yellow(
      `Farm:: gained LCNs: ${LCNsGained}`
    ));
    expect(parseInt(LCNsGained)).toBeGreaterThan(0);
  });
  // test("withdraw uniLP tokens from Pickles EthDai Jar", async () => {
  //   let tx1 = await lUNIDAIContract.withdrawAll();
  //   await tx1.wait();

  //   const LPTokensAfter = await uniswapPair.balanceOf(user1.address);
  //   console.log(chalk.yellow(
  //     `uniTokens after withdrawl: ${parseFloat(fromWei(LPTokensAfter))}`
  //   ));
  //   // expect(parseFloat(fromWei(LPTokensAfter))).toBeGreaterThanOrEqual(parseFloat(fromWei(LPTokens)));
  // });
});