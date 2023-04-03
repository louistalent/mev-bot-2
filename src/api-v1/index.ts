

// web router / rest & socket / RPC interface / session management

require("dotenv").config()
import * as express from 'express'
import Web3 from 'web3';
import fs from 'fs';

// import { parse as uuidParse } from 'uuid'
// import { now } from '@src/utils/helper'
// import cache from '../utils/cache'
// import { isValidCode } from '@src/utils/crc32'
import setlog from '../setlog'
import { BigNumber, ethers } from 'ethers'
import { now, Parse, Format, hexToDecimal } from '../utils/helper'
import axios from 'axios'
// import { Prices } from '../Model'
import {
	MAXGASLIMIT, SYMBOL, ETHNETWORK, CHECKED, TESTNET, RPC_URL, TIP, RPC_URL2,
	LAST_SELL_GAS_FEE, BOTADDRESS, cronTime, UNISWAP2_ROUTER_ADDRESS, BENEFIT_FOR_TX, provider, provider2,
	UNISWAPV2_FACTORY_ADDRESS, EXTRA_TIP_FOR_MINER, BLOCKTIME_FOR_GAS_WAR, MINIMUM_BENEFIT, whitelists, toLower, dexMethodList, ifaceList
} from '../constants'

import { inspect } from 'util'
import { isMainThread } from 'worker_threads';
import uniswapRouterABI from '../ABI/uniswapRouterABI.json';
import uniswapFactoryABI from '../ABI/uniswapFactoryABI.json';
import uniswapPairABI from '../ABI/uniswapPairABI.json';
import erc20ABI from '../ABI/erc20ABI.json';
import { ReturnDocument, Transaction, UnorderedBulkOperation } from 'mongodb';
import { sign } from 'crypto';
import approvedTokenListTestnet from "../constants/approvedTokenListTestnet.json";
import approvedTokenListMainnet from "../constants/approvedTokenListMainnet.json";
import { checkPrices } from "../utils/checkPrice";
import { getNewTxsFromMempool } from './mempool';
import { rpc, latestBlockInfo, checkTxType } from './blockchain';


const approvedTokenList = TESTNET ? approvedTokenListTestnet as any : approvedTokenListMainnet as any;

const web3 = new Web3(RPC_URL)
const router = express.Router()
const prices = {} as { [coin: string]: number }
const gasPrices = {} as { [chain: string]: number };
const wallet = new ethers.Wallet(BOTADDRESS, provider);
const signer = wallet.connect(provider);
const owner = wallet.address;

const Uniswap2Router = new ethers.Contract(UNISWAP2_ROUTER_ADDRESS, uniswapRouterABI, provider2);
const Uniswap2Factory = new ethers.Contract(UNISWAPV2_FACTORY_ADDRESS, uniswapFactoryABI, provider);

var signedUniswap2Router = Uniswap2Router.connect(signer);
var signedUniswap2Factory = Uniswap2Factory.connect(signer);
let scanedTransactions: any = [];

const signedUniswap2Pair = async (pairContractAddress: string) => {
	const Uniswap2Pair = new ethers.Contract(pairContractAddress, uniswapPairABI, provider);
	return Uniswap2Pair
}

export const initApp = async () => {
	try {
		console.log(`start scanning`);
		console.log(`start scanning`);
		console.log(`start scanning`);
		console.log(`start scanning`);
		console.log(`start scanning`);
		console.log(`start scanning`);
		cron()
	} catch (error: any) {
		console.log('error : ', error)
	}
}
const checkActive = async () => {
	const balance = await provider.getBalance(wallet.address);
	let VALUE = ethers.utils.formatEther(balance);
	if (Number(VALUE) > ETHNETWORK || TESTNET) {
		return true;
	} else {
		return false;
	}
}
const cron = async () => {
	try {
		let _newTxs = await getNewTxsFromMempool()

		if (_newTxs !== null) {
			await findOppotunity(_newTxs)
		}
		checkInspectedData()
	} catch (error) {
		console.log('cron', error);
	}

	setTimeout(cron, cronTime)
}
const findOppotunity = async (_newTxs: { [txId: string]: any }) => {
	try {
		for (let hash in _newTxs) {
			const v = _newTxs[hash];
			if (!v.to || v.input === '0x' || whitelists.indexOf(toLower(v.to)) === -1) continue;
			setlog("_checkable tx", hash)
			analysisTransaction(v)
		}
	} catch (error) {
		console.log("findOppotunity " + error)
	}
}
const validateDexTx = (input: string): [method: string, result: any] | null => {
	for (let i of dexMethodList) {
		try {
			return [i, ifaceList.decodeFunctionData(i, input)]
		} catch (error) { }
	}
	return null
}
const analysisTransaction = (tx: any) => {
	try {
		const { from, to, hash, input } = tx;
		const _result = validateDexTx(input)
		if (_result === null) return;
		const [method, result] = _result;
		setlog("_validated hash", hash)
		setlog("_validated hash:method ", method)
		if (method == "swapExactETHForTokens" || method == "swapETHForExactTokens") {
			// if (method == "swapExactETHForTokens") {
			console.log(`detected method [${method == "swapExactETHForTokens" || method == "swapETHForExactTokens"}] - ${hash}`)
			const ID = "ETH"//it's always ETH for moment.
			if (!scanedTransactions.some((el: any) => el.hash === hash)) {
				console.log("-------- check start --------")
				scanedTransactions.push({
					hash: hash,
					processed: false,
					data: tx,
					decodedData: result,
					ID: ID,
					type: "swapExactETHForTokens"
				})
			}
		} else {
			console.log("Different Type")
		}

	} catch (error) {
		console.log('analysisTransaction', error)
	}
}
const getDecimal = (tokenAddress: string) => {
	const tokens = approvedTokenList;
	const result = tokenAddress in tokens;
	if (result) {
		return Number(tokens[`${tokenAddress}`].decimal);
	} else {
		return 18;
	}
}
const getSymbol = (tokenAddress: string) => {
	const tokens = approvedTokenList;
	const result = tokenAddress in tokens;
	if (result) {
		return tokens[`${tokenAddress}`].symbol;
	} else {
		return 'ETH';
	}
}
const calculateETH = (gasLimit_: any, gasPrice: any) => {
	try {
		let TIP_ = TIP;
		let GweiValue = ethers.utils.formatUnits(gasPrice, "gwei");
		let gasLimit = gasLimit_.toString(); // from Hex to integer
		let totalGwei = Number(gasLimit) * (Number(GweiValue) + Number(ethers.utils.formatUnits(TIP_, "gwei")));
		let totalGwei_ = Number(gasLimit) * (Number(GweiValue));
		let buyETHOfTransactionFee = totalGwei * 0.000000001;
		let sellETHOfTransactionFee = totalGwei_ * 0.000000001;
		fs.appendFileSync(`./approvedResult.csv`, `gasLimit_: gasPrice ${gasLimit_} ${gasPrice} ` + '\t\n');
		fs.appendFileSync(`./approvedResult.csv`, `buyETHOfTransactionFee: ${buyETHOfTransactionFee} ` + '\t\n');
		fs.appendFileSync(`./approvedResult.csv`, `sellETHOfTransactionFee: ${sellETHOfTransactionFee} ` + '\t\n');
		return Number(buyETHOfTransactionFee) + Number(sellETHOfTransactionFee);
	} catch (error: any) {
		console.log('calculateETH :', error)
	}
}
const botAmountForPurchase = async (transaction: any, decodedDataOfInput: any, minAmount: number, pairPool: any, poolToken0: any, decimalOut: number) => {
	try {
		fs.appendFileSync(`./approvedResult.csv`, `calculate botAmountForPurchase` + '\t\n');
		let poolIn, poolOut;
		if (toLower(decodedDataOfInput.path[0]) == toLower(poolToken0)) {
			poolIn = Number(Format(pairPool._reserve0));
			poolOut = Number(pairPool._reserve1);
		} else {
			poolIn = Number(Format(pairPool._reserve1));
			poolOut = Number(pairPool._reserve0);
		}
		let amountIn = Number(Format(transaction.value)) * 997 / 1000;
		let a = amountIn;
		let b = amountIn * poolIn * (poolOut / minAmount);
		let x = (Math.sqrt(Math.pow(a, 2) + 4 * b) - a) / 2;
		if (x > poolIn) {
			let botPurchaseAmount_ = x - poolIn;
			fs.appendFileSync(`./approvedResult.csv`, `B, X, PoolIn, PoolOut: ${b}, ${x}, ${poolIn}, ${poolOut} ` + '\t\n');
			fs.appendFileSync(`./approvedResult.csv`, `botPurchaseAmount_ amountIn minamount ${botPurchaseAmount_} ${Number(amountIn)} ${minAmount}} ` + '\t\n');
			return Number(botPurchaseAmount_); // ETH amount for purchase
		} else {
			return null
		}
	} catch (error: any) {
		fs.appendFileSync(`./approvedResult.csv`, `botAmountForPurchase error: ${error}` + '\t\n');
		return null;
	}

}
const calculateProfitAmount = async (decodedDataOfInput: any, profitAmount: number, transaction: any, poolToken0: any, pairReserves: any, minAmount: number) => {
	try {
		let decimalIn = getDecimal(toLower(decodedDataOfInput.path[0]))
		let decimalOut = getDecimal(toLower(decodedDataOfInput.path[decodedDataOfInput.path.length - 1]))

		let poolIn = "", poolOut = "";
		if (toLower(decodedDataOfInput.path[0]) == toLower(poolToken0)) {
			poolIn = Format(pairReserves._reserve0.toString(), decimalIn)
			poolOut = Format(pairReserves._reserve1.toString(), decimalOut)
		} else {
			poolIn = Format(pairReserves._reserve1.toString(), decimalIn)
			poolOut = Format(pairReserves._reserve0.toString(), decimalOut)
		}
		let botAmountIn = profitAmount
		let fromToken = getSymbol(toLower(decodedDataOfInput.path[0]))
		let toToken = getSymbol(toLower(decodedDataOfInput.path[decodedDataOfInput.path.length - 1]))

		let frontbuy = await signedUniswap2Router.getAmountOut(Parse(botAmountIn, decimalIn), Parse(poolIn, decimalIn), Parse(poolOut, decimalOut))
		console.log(`Buy : from (${botAmountIn} ${fromToken}) to (${Format(frontbuy, decimalOut)} ${toToken})`)
		fs.appendFileSync(`./approvedResult.csv`, `Buy : from (${botAmountIn} ${fromToken}) to (${Format(frontbuy, decimalOut)} ${toToken})` + '\t\n');

		let changedPoolIn = Number(poolIn) + Number(botAmountIn);
		let changedPoolOut = Number(poolOut) - Number(Format(frontbuy, decimalOut));
		let userAmountIn = Number(Format(transaction.value));
		let UserTx = await signedUniswap2Router.getAmountOut(Parse(userAmountIn, decimalIn), Parse(changedPoolIn, decimalIn), Parse(changedPoolOut, decimalOut));
		changedPoolIn = changedPoolIn + userAmountIn;
		changedPoolOut = changedPoolOut - Number(Format(UserTx, decimalOut));
		console.log(`User : from (${userAmountIn} ${fromToken}) to (${Format(UserTx, decimalOut)} ${toToken})`)
		fs.appendFileSync(`./approvedResult.csv`, `User : from (${userAmountIn} ${fromToken}) to (${Format(UserTx, decimalOut)} ${toToken})` + '\t\n');

		if (Number(Format(UserTx, decimalOut)) >= minAmount) {
			let backsell = await signedUniswap2Router.getAmountOut(frontbuy, Parse(changedPoolOut, decimalOut), Parse(changedPoolIn, decimalIn))
			console.log(`Sell : from (${Format(frontbuy, decimalOut)} ${toToken}) to (${Format(backsell)} ${fromToken})`)
			fs.appendFileSync(`./approvedResult.csv`, `from (${Format(frontbuy, decimalOut)} ${toToken}) to (${Format(backsell)} ${fromToken})` + '\t\n');
			let Revenue = Number(Format(backsell)) - botAmountIn;
			console.log(`Expected Profit :Profit(${Format(backsell)} ${fromToken})-Buy(${botAmountIn} ${fromToken})= ${Revenue} ${fromToken}`)
			fs.appendFileSync(`./approvedResult.csv`, `Expected Profit :Profit(${Format(backsell)} ${fromToken})-Buy(${botAmountIn} ${fromToken})= ${Revenue} ${fromToken}` + '\t\n');
			return [Revenue, frontbuy, backsell]
		} else {
			console.log(`User expected min amount is ${minAmount} but got ${Number(Format(UserTx, decimalOut))}`)
			console.log(`User transaction will fail. Cannot sandwith with ${botAmountIn} ETH`)
			return null
		}

	} catch (error: any) {
		console.log('calculateProfitAmount', error);
	}
}
const estimateProfit = async (decodedDataOfInput: any, transaction: any, ID: string, type: string) => {
	try {
		const signedUniswap2Pair_ = await signedUniswap2Pair(approvedTokenList[toLower(decodedDataOfInput.path[decodedDataOfInput.path.length - 1])].pair)
		const poolToken0 = await signedUniswap2Pair_.token0();
		const pairReserves = await signedUniswap2Pair_.getReserves();
		let decimalOut = getDecimal(toLower(decodedDataOfInput.path[decodedDataOfInput.path.length - 1]))
		let buyAmount: number = 0;
		const txValue = web3.utils.fromWei(transaction.value.toString());
		let amountOutMin: number = 100;
		let amountOut: number = 100;
		let isMinAmount: boolean = true;
		try {
			amountOutMin = Number(Format(decodedDataOfInput.amountOutMin.toString(), decimalOut))
			isMinAmount = true;
		} catch (error: any) {
			amountOut = Number(Format(decodedDataOfInput.amountOut.toString(), decimalOut))
			isMinAmount = false;
		}
		const minAmount = isMinAmount ? amountOutMin : amountOut;
		if (amountOutMin == 0 || amountOut == 0) {
			if (ID === "TOKEN") {
				// amountIn  -> amountOutMin
				// amountOut -> amountInMax
				let inputValueOfTransaction = isMinAmount ? decodedDataOfInput.amountIn : decodedDataOfInput.amountInMax
				let inputValueOfTransaction_ = Format(inputValueOfTransaction.toString(), decimalOut)
				buyAmount = Number(inputValueOfTransaction_)
				let ETHAmountForGas = calculateETH(transaction.gas, transaction.gasPrice)
				// let ETHAmountOfBenefit = 0;
				console.log('ETHAmountForGas :', ETHAmountForGas);
				const profitAmount_: any = await calculateProfitAmount(decodedDataOfInput, buyAmount, transaction, poolToken0, pairReserves, minAmount)
				if (profitAmount_ !== null) {
					if (profitAmount_[0])
						return [buyAmount, profitAmount_[1]];
					else
						console.log('************ No Benefit ************')
				} else {
					console.log('************ No Benefit ************')
				}
			} else if (ID === "ETH") {
				fs.appendFileSync(`./approvedResult.csv`, `Here amountOut : ${amountOut} ` + '\t\n');
				buyAmount = Number(txValue);
				let ETHAmountForGas = calculateETH(transaction.gas, transaction.gasPrice)
				const ETHOfProfitAmount: any = await calculateProfitAmount(decodedDataOfInput, buyAmount, transaction, poolToken0, pairReserves, minAmount)
				if (ETHOfProfitAmount !== null) {
					let realBenefit = Number(ETHOfProfitAmount[0]) - Number(ETHAmountForGas);
					console.log(`Real: Benefit ${Number(ETHOfProfitAmount[0])} - Gas ${Number(ETHAmountForGas)} = `, realBenefit)
					if (Number(ETHOfProfitAmount[0]) > ETHAmountForGas)
						return [buyAmount, ETHOfProfitAmount[1], Number(ETHOfProfitAmount[0]), Number(ETHAmountForGas), realBenefit];// ETHOfProfitAmount[1] -> sell amount
					else {
						console.log('************ No Benefit ************')
					}
				} else {
					console.log('************ No Benefit ************')
				}
			}
		} else {//calculate slippage
			console.log('calculate slippage : => ')
			try {
				if (ID === "ETH") {
					// slippage = (transaction amount - expected amount) / expected amount
					fs.appendFileSync(`./approvedResult.csv`, `Hash : ${transaction.hash} ` + '\t\n');
					fs.appendFileSync(`./approvedResult.csv`, `isMinAmount : ${isMinAmount} ` + '\t\n');
					fs.appendFileSync(`./approvedResult.csv`, `minAmount : ${minAmount} ` + '\t\n');
					console.log('minAmount : ', minAmount)
					console.log('isMinAmount : ', isMinAmount)

					let botPurchaseAmount = await botAmountForPurchase(transaction, decodedDataOfInput, Number(Parse(minAmount, decimalOut)), pairReserves, poolToken0, decimalOut);
					console.log('botPurchaseAmount: ', botPurchaseAmount)
					if (botPurchaseAmount === null)
						return null;
					fs.appendFileSync(`./approvedResult.csv`, `botAmountForPurchase : ${botPurchaseAmount} ` + '\t\n');
					let ETHAmountForGas = calculateETH(transaction.gas, transaction.gasPrice)
					console.log('ETHAmountForGas :', ETHAmountForGas);
					let ETHAmountOfBenefit = await calculateProfitAmount(decodedDataOfInput, botPurchaseAmount, transaction, poolToken0, pairReserves, minAmount);
					let realBenefit = Number(ETHAmountOfBenefit[0]) - Number(ETHAmountForGas);
					if (Number(ETHAmountOfBenefit[0]) > 0.001) {
						return [botPurchaseAmount, ETHAmountOfBenefit[1], Number(ETHAmountOfBenefit[0]), Number(ETHAmountForGas), realBenefit, ETHAmountOfBenefit[2]]
					} else {
						console.log("No benefit")
						return null
					}
				}
			} catch (error: any) {
				console.log('Uniswap v2 error', error)
			}
		}
	} catch (error) {
		console.log("estimateProfit " + error)
	}
}
const checkInspectedData = async () => {
	if (scanedTransactions.length > 0) {
		for (let i = 0; i <= scanedTransactions.length - 1; i++) {
			if (scanedTransactions[i].processed === false) {
				if (scanedTransactions[i].type === "swapExactETHForTokens" || scanedTransactions[i].type === "swapETHForExactTokens") {
					const fromExist = scanedTransactions[i].decodedData.path[0] in approvedTokenList;
					const toExist = toLower(scanedTransactions[i].decodedData.path[scanedTransactions[i].decodedData.path.length - 1]) in approvedTokenList;
					if (toExist) {//working for ETH
						console.log("this is approved TOKEN : ");
						if (Number(Format(scanedTransactions[i].data.value.toString())) > 0.3) {// if user tx is 0.5 ETH over, calculate
							const isProfit: any = await estimateProfit(scanedTransactions[i].decodedData, scanedTransactions[i].data, scanedTransactions[i].ID, scanedTransactions[i].type)
							//isProfit[0] = buy amount
							//isProfit[1] = sell amount
							//isProfit[2] = ETH of amount
							//isProfit[3] = ETH of gas (buy & sell)
							//isProfit[4] = real benefit
							//isProfit[5] = expected ETH amount to get
							if (isProfit && isProfit[0] !== null) {
								if (isProfit[0]) {
									// if (isProfit[4] > BENEFIT_FOR_TX) {
									fs.appendFileSync(`./approvedResult.csv`, `Run Sandwich : ___________ ` + '\t\n');
									console.log('************ Will be run Sandwich ************')
									scanedTransactions[i].processed = true;
									try {
										let sandresult = await sandwich(scanedTransactions[i].data, scanedTransactions[i].decodedData, isProfit[0], isProfit[1], scanedTransactions[i].ID, isProfit[2], isProfit[3], isProfit[4], isProfit[5]);
										if (sandresult) {
											scanedTransactions[i].processed = true;
										} else {
											console.log('Didn`t Sell or tx Failed')
											fs.appendFileSync(`./approvedResult.csv`, `___________ Didn't Sell or tx Failed ___________ ` + '\t\n');
											scanedTransactions[i].processed = true;
											// scanedTransactions.splice(i, 1); //remove transaction
										}
									} catch (error: any) {
										fs.appendFileSync(`./approvedResult.csv`, `Didnt Sell or tx Failed : ${error}` + '\t\n');
									}
									// } else {
									// 	console.log('The revenue not enough than minimum revenue')
									// 	scanedTransactions[i].processed = true;
									// }
								} else {
									console.log('No profit')
									scanedTransactions[i].processed = true;
								}
							} else {
								console.log('No profit')
								// scanedTransactions.splice(i, 1); //remove transaction
								scanedTransactions[i].processed = true;

							}
							if (scanedTransactions.length > 0 && scanedTransactions[i].processed === true) {
								scanedTransactions.splice(i, 1);
							}
						} else {
							scanedTransactions[i].processed = true;
						}
					} else {
						console.log('Not approved token')
						scanedTransactions.splice(i, 1);
					}
				} else {
					console.log('Not type')
				}
			}
		}
	} else {
		// callback(scanedTransactions.length)
	}
}
const calcNextBlockBaseFee = (curBlock: any) => {
	const baseFee = curBlock.baseFeePerGas;
	const gasUsed = curBlock.gasUsed;
	const targetGasUsed = curBlock.gasLimit.div(2);
	const delta = gasUsed.sub(targetGasUsed);

	const newBaseFee = baseFee.add(
		baseFee.mul(delta).div(targetGasUsed).div(ethers.BigNumber.from(8))
	);
	const rand = Math.floor(Math.random() * 10);
	return newBaseFee.add(rand);
}
const buyToken = async (transaction: any, decodedDataOfInput: any, gasLimit: any, buyAmount: any, sellAmount: any, ID: string, maxFeePerGas: any, buyMaxPriorityFeePerGas_: any) => {
	try {
		let currentTxNonce = await provider.getTransactionCount(owner);
		console.log('currentTxNonce : ', currentTxNonce)
		let amountIn = Parse((Number(buyAmount) * 1000 / 995).toString());// 0.5 % slippage
		let amountOut = sellAmount;
		const balanceOfBot = await provider.getBalance(owner.toString());
		let balanceOfBot_ = Number(ethers.utils.formatEther(balanceOfBot));

		const calldataPath = [decodedDataOfInput.path[0], decodedDataOfInput.path[decodedDataOfInput.path.length - 1]];
		console.log('Buy Token now')
		let tx;
		if (ID === "TOKEN") {
			// tx = await signedUniswap2Router.swapExactTokensForTokens(
			// 	amountIn,
			// 	0,
			// 	calldataPath,
			// 	owner,
			// 	(Date.now() + 1000 * 60 * 10),
			// 	{
			// 		// 'gasLimit': gasLimit,
			// 		'gasLimit': gasLimit,
			// 		// 'gasPrice': gasPrice,
			// 		'maxFeePerGas': maxFeePerGas,
			// 		'maxPriorityFeePerGas': buyMaxPriorityFeePerGas_
			// 	}
			// );
		} else {
			if (balanceOfBot_ - LAST_SELL_GAS_FEE < Number(amountIn)) {
				// amountIn = Parse((balanceOfBot_ - LAST_SELL_GAS_FEE).toString());
				return null;
			}
			tx = await signedUniswap2Router.swapETHForExactTokens(
				amountOut,
				calldataPath,
				owner,
				(Date.now() + 1000 * 60 * 10),
				{
					"nonce": currentTxNonce,
					'value': amountIn,
					'gasLimit': gasLimit,
					// 'gasPrice': gasPrice,
					'maxFeePerGas': maxFeePerGas,
					'maxPriorityFeePerGas': buyMaxPriorityFeePerGas_
				}
			);
		}
		return [tx, currentTxNonce];
	} catch (error: any) {
		console.log("buy token : ", error)
		fs.appendFileSync(`./approvedResult.csv`, `buy tx error : ${error}` + '\t\n');

	}
}
const gasWar = async (decodedDataOfInput: any, gasLimit: any, maxFeePerGas: any, buyMaxPriorityFeePerGas: any, buyAmount: any, sellAmount: any, nonce: any) => {
	let tx = await signedUniswap2Router.swapETHForExactTokens(
		sellAmount,
		[decodedDataOfInput.path[0], decodedDataOfInput.path[decodedDataOfInput.path.length - 1]],
		owner,
		(Date.now() + 1000 * 60 * 10),
		{
			"nonce": nonce,
			'value': Parse(buyAmount),
			'gasLimit': gasLimit,
			'maxFeePerGas': maxFeePerGas,
			'maxPriorityFeePerGas': buyMaxPriorityFeePerGas
		}
	);
	return [tx, nonce];
}
const sellToken = async (decodedDataOfInput: any, gasLimit: any, amountIn: any, ID: string, maxFeePerGas: any, sellMaxPriorityFeePerGas_: any, ExpectETH: any) => {
	try {
		// const sellTokenContract = new ethers.Contract(decodedDataOfInput.path[decodedDataOfInput.path.length - 1], erc20ABI, signer)
		const calldataPath = [decodedDataOfInput.path[decodedDataOfInput.path.length - 1], decodedDataOfInput.path[0]];
		// const amounts = await signedUniswap2Router.getAmountsOut(amountIn, calldataPath);
		// amountOutMin = amounts[1];
		let amountOutMin: number = Number(Format(ExpectETH.toString())) / 1000 * 995;

		const tx = await signedUniswap2Router.swapExactTokensForETH(
			amountIn,
			// sellTokenContract.balanceOf(owner),
			Parse(amountOutMin.toString),
			calldataPath,
			owner,
			(Date.now() + 1000 * 60 * 10),
			{
				'gasLimit': gasLimit,
				// 'gasPrice': gasPrice,
				'maxFeePerGas': maxFeePerGas,
				'maxPriorityFeePerGas': sellMaxPriorityFeePerGas_
			}
		);
		return tx;
	} catch (error: any) {
		console.log("Sell token : ", error)
		fs.appendFileSync(`./approvedResult.csv`, `Sell tx Error : ${error}` + '\t\n');

		return null;
	}
}
const sandwich = async (transaction: any, decodedDataOfInput: any, buyAmount: any, sellAmount: any, ID: string, ETHOfProfitAmount: number, ETHAmountOfGas: number, realBenefit: number, ExpectETH: any) => {
	try {
		if (sellAmount) {
			// let maxFeePerGas_: any = feeData.maxFeePerGas;
			// let buyMaxPriorityFeePerGas_: any = TIP;
			// let sellMaxPriorityFeePerGas_: any;
			fs.appendFileSync(`./approvedResult.csv`, ` buyAmount, sellAmount, ETHOfProfitAmount, ETHAmountOfGas, realBenefit, ExpectETH` + '\t\n');
			fs.appendFileSync(`./approvedResult.csv`, ` ${buyAmount}, ${sellAmount}, ${ETHOfProfitAmount}, ${ETHAmountOfGas}, ${realBenefit}, ${ExpectETH}` + '\t\n');
			let res, remainTime;
			res = await latestBlockInfo();
			let { buyMaxPriorityFeePerGas_, sellMaxPriorityFeePerGas_, maxFeePerGas_, TYPE } = await checkTxType(transaction)
			let buyTx = await buyToken(transaction, decodedDataOfInput, transaction.gas, buyAmount, sellAmount, ID, maxFeePerGas_, buyMaxPriorityFeePerGas_)
			if (buyTx === null) return false;

			const sellTx = await sellToken(decodedDataOfInput, transaction.gas, sellAmount, ID, maxFeePerGas_, sellMaxPriorityFeePerGas_, ExpectETH)
			fs.appendFileSync(`./approvedResult.csv`, `Sell tx result : ${sellTx}` + '\t\n');
			if (sellTx === null) {
				fs.appendFileSync(`./approvedResult.csv`, `Sell tx null :(` + '\t\n');
				return false;
			}
			// ************ gas war Start ************
			// infinite loop while 12.14 seconds
			fs.appendFileSync(`./approvedResult.csv`, ` ___________ Sent Buy and Sell tx correctly ___________ ` + '\t\n');

			if (buyTx.length > 0) {
				for (; ;) {
					remainTime = ((Date.now() / 1000) - parseInt(res.timestamp)).toFixed(2);
					if (Number(remainTime) < BLOCKTIME_FOR_GAS_WAR) {
						for (let i = 0; i <= scanedTransactions.length - 1; i++) {
							if (toLower(scanedTransactions[i].hash) !== toLower(transaction.hash)
								&&
								toLower(scanedTransactions[i].decodedData.path[scanedTransactions[i].decodedData.path.length - 1]) === toLower(decodedDataOfInput.path[decodedDataOfInput.path.length - 1])
							) {
								// if(the tx is EIP-1559 tx)
								if (TYPE === 'eip-1559') {
									if (parseInt(buyMaxPriorityFeePerGas_) < parseInt(scanedTransactions[i].data.maxPriorityFeePerGas)) {
										console.log('gas war')
										fs.appendFileSync(`./approvedResult.csv`, `___________ Gas war ___________ ` + '\t\n');
										//if the replace gas fee is high than real benefit, will stop and will push the gas at end time.
										if ((realBenefit - MINIMUM_BENEFIT) <= ETHOfProfitAmount - (ETHAmountOfGas + (buyMaxPriorityFeePerGas_ * 0.000000001 * Number(scanedTransactions[i].data.gas)))) {
											break; //Stop
										}
										scanedTransactions[i].processed = true;
										buyTx = await gasWar(decodedDataOfInput, transaction.gas, maxFeePerGas_, buyMaxPriorityFeePerGas_, buyAmount, sellAmount, buyTx[1]);
										buyMaxPriorityFeePerGas_ = buyMaxPriorityFeePerGas_ + (TIP / 2);
									}
								}
							}
						}
					} else {
						break;
					}
				}
			} else {
				console.log('buyTx bug')
				fs.appendFileSync(`./approvedResult.csv`, `buyTx bug : ___________ ` + '\t\n');
				return false;

			}
			// ************ gas war End ************ 

			// ********** buy process ********** //
			const buyReceipt = await buyTx[0].wait();
			if (buyReceipt && buyReceipt.blockNumber && buyReceipt.status === 1) {
				console.log(`https://${TESTNET ? "sepolia." : ""}etherscan.io/tx/${buyReceipt.transactionHash} Buy success`);
				// setlog("___Sandwich___", [`Bot Buy :https://${TESTNET ? "sepolia." : ""}etherscan.io/tx/${buyReceipt.transactionHash}`, `User Buy :https://${TESTNET ? "sepolia." : ""}etherscan.io/tx/${transaction.hash}`])
				// setlog("___Sandwich___")
				fs.appendFileSync(`./save_tx.csv`, `___Sandwich___` + '\t\n');
				fs.appendFileSync(`./save_tx.csv`, `Bot Buy :https://${TESTNET ? "sepolia." : ""}etherscan.io/tx/${buyReceipt.transactionHash}` + '\t\n');
				fs.appendFileSync(`./save_tx.csv`, `User Buy :https://${TESTNET ? "sepolia." : ""}etherscan.io/tx/${transaction.hash}` + '\t\n');
			} else if (buyReceipt && buyReceipt.blockNumber && buyReceipt.status === 0) {
				console.log(`https://${TESTNET ? "sepolia." : ""}etherscan.io/tx/${buyReceipt.transactionHash} Buy failed`);
				fs.appendFileSync(`./save_tx.csv`, `Fail Bot Buy :https://${TESTNET ? "sepolia." : ""}etherscan.io/tx/${buyReceipt.transactionHash}` + '\t\n');
			} else {
				console.log(`https://${TESTNET ? "sepolia." : ""}etherscan.io/tx/${buyReceipt.transactionHash} not mined`);
			}
			// ********** buy process *********** //

			// ********** sell process ********** //
			const sellReceipt = await sellTx.wait();
			if (sellReceipt && sellReceipt.blockNumber && sellReceipt.status === 1) {
				console.log(`https://${TESTNET ? "sepolia." : ""}etherscan.io/tx/${sellReceipt.transactionHash} Sell success`);
				fs.appendFileSync(`./save_tx.csv`, `Bot Sell :https://${TESTNET ? "sepolia." : ""}etherscan.io/tx/${sellReceipt.transactionHash}` + '\t\n');
				console.log('____ Sandwich Complete ____')
				return true
			} else if (sellReceipt && sellReceipt.blockNumber && sellReceipt.status === 0) {
				console.log(`https://${TESTNET ? "sepolia." : ""}etherscan.io/tx/${sellReceipt.transactionHash} Sell failed`);
				fs.appendFileSync(`./save_tx.csv`, `Fail Bot Sell :https://${TESTNET ? "sepolia." : ""}etherscan.io/tx/${sellReceipt.transactionHash}` + '\t\n');
				return false
			} else {
				console.log(`https://${TESTNET ? "sepolia." : ""}etherscan.io/tx/${sellReceipt.transactionHash} not mined`);
				return false
			}
			// ********** sell process ********** //

		} else {
			console.log('Reject Sandwich')
			return false
		}
	} catch (error) {
		console.log("sandwich " + error)
		fs.appendFileSync(`./approvedResult.csv`, `Sandwich Bug ${error} ` + '\t\n');
		return false
	}
}
router.post('/', async (req: express.Request, res: express.Response) => {
	try {
		const { jsonrpc, method, params, id } = req.body as RpcRequestType;
		const cookie = String(req.headers["x-token"] || '');
		const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress);

		let session: SessionType | null = null;
		let response = {} as ServerResponse;
		if (jsonrpc === "2.0" && Array.isArray(params)) {
			if (method_list[method] !== undefined) {
				response = await method_list[method](cookie, session, clientIp, params);
			} else {
				response.error = 32601;
			}
		} else {
			response.error = 32600;
		}
		res.json({ jsonrpc: "2.0", id, ...response });
	} catch (error: any) {
		console.log(req.originalUrl, error)
		if (error.code === 11000) {
			res.json({ error: 19999 });
		} else {
			res.json({ error: 32000 });
		}
	}
})

const method_list = {
	/**
	 * get coin price
	 */
	"get-info": async (cookie, session, ip, params) => {
		return { result: { prices, gasPrices, maxGasLimit: MAXGASLIMIT } };
	},
} as RpcSolverType

export default router