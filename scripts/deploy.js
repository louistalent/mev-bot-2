const colors = require("colors");
const fs = require("fs");
require("dotenv").config()
const { ethers } = require("hardhat");
const testToken = require("../src/constants/approvedTokenListTestnet.json")
const mainToken = require("../src/constants/approvedTokenListMainnet.json")

const tokenlist = process.env.TESTNET ? testToken : mainToken;

async function main() {
	// get network
	var [owner] = await ethers.getSigners();

	let network = await owner.provider._networkPromise;
	let chainId = network.chainId;
	let provider = new ethers.providers.JsonRpcProvider("http://localhost:8545")
	let feeData = await provider.getFeeData();

	console.log(chainId, owner.address);
	{
		let maxFeePerGas_ = Number(feeData.maxFeePerGas);// if user tx is EIP-1559
		maxFeePerGas_ = Number(maxFeePerGas_) + (550000000);
		for (let address in mainToken) {
			let TOKEN = (await ethers.getContractFactory("ERC20")).attach(`${address}`)
			var tx = await TOKEN.approve(
				process.env.UNISWAP2_ROUTER_ADDRESS,
				"0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
				{
					// 'gasLimit': gasLimit,
					// 'gasPrice': gasPrice,
					'maxFeePerGas': "0x" + maxFeePerGas_.toString(16),
					'maxPriorityFeePerGas': "0x" + (100000000).toString(16)
				}
			);
			let app = await tx.wait();
			console.log('approved : tx ' + app);
			console.log(app);
		}

	}

}

main()
	.then(() => {
		console.log("complete".green);
	})
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
