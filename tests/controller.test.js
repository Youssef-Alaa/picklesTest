/* eslint-disable no-undef */
const { ethers } = require("ethers");
const chalk = require("chalk");
// const uniswap = require("@studydefi/money-legos/uniswap");
// const erc20 = require("@studydefi/money-legos/erc20");
const { constants } = require('@openzeppelin/test-helpers');
const { ZERO_ADDRESS } = constants;
const { ABIS, BYTECODE, KEYS } = require("../scripts/constants");
const { deployContract, provider, wallets } = require("../scripts/common");

jest.setTimeout(100000);
let wallet;
let Controller;
let psUNIDAI;
let StrategyUniEthDaiLpV4;

const tempGov = wallets[0].address;
const tempTimelock = wallets[0].address;
const strategist = wallets[1].address;
const devfund = "0x2fee17F575fa65C06F10eA2e63DBBc50730F145D";
const treasury = "0x066419EaEf5DE53cc5da0d8702b990c5bc7D1AB3";
const uniEthDai = "0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11";

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

  test("valid governance address", async () => {
    const contGovernance = await Controller.governance();
    expect(contGovernance).toBe(tempGov);
  });

  test("valid strategist address", async () => {
    const contStrategist = await Controller.strategist();
    expect(contStrategist).toBe(strategist);
  });

  test("valid timeLock address", async () => {
    const contTimeLock = await Controller.timelock();
    expect(contTimeLock).toBe(tempTimelock);
  });

  test("valid devFund address", async () => {
    const contDEvFund = await Controller.devfund();
    expect(contDEvFund).toBe(devfund);
  });

  test("valid treasury address", async () => {
    const contTreasury = await Controller.treasury();
    expect(contTreasury).toBe(treasury);
  });

  const setJarApproveAndSetStrategy = async (jar, strat) => {
    const gasPrice = await wallet.provider.getGasPrice();
    const fastGasPrice = gasPrice
      .mul(ethers.BigNumber.from(125))
      .div(ethers.BigNumber.from(100));
  
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