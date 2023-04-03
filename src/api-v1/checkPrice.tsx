
// export const checkPrices = async (token: string) => {
// 	const pairs: { [key: string]: string } = {
// 		ETH: 'ETHUSDT',
// 		BNB: 'BNBUSDT',
// 		BTC: 'BTCUSDT',
// 		WBTC: 'WBTCBUSD',
// 		AVAX: 'AVAXUSDT',
// 		MATIC: 'MATICUSDT',
// 		UNI: 'UNIUSDT',
// 		LINK: 'LINKUSDT',
// 		USDC: 'USDCUSDT',
// 		BUSD: 'BUSDUSDT',
// 		TUSD: 'TUSDUSDT',
// 	}
// 	try {
// 		for (let coin in pairs) {
// 			const result: any = await axios('https://api.binance.com/api/v3/ticker/price?symbol=' + pairs[coin])
// 			if (result !== null && result.data && result.data.price) {
// 				const updated = now();
// 				const price = Number(result.data.price);
// 				await Prices.updateOne({ coin }, { $set: { coin, price, updated } }, { upsert: true });
// 				prices[coin] = price;
// 			}

// 			await new Promise(resolve => setTimeout(resolve, 500));
// 		}
// 		prices.USDT = 1;
// 		const json = {
// 			"jsonrpc": "2.0",
// 			"method": "eth_gasPrice",
// 			"params": [] as string[],
// 			"id": 0
// 		}
// 		return 0;
// 		// const gas = await axios.post(networks[SYMBOL].rpc, json, { headers: { 'Content-Type': 'application/json' } });
// 		// if (gas?.data && gas?.data?.result) gasPrices[SYMBOL] = Math.ceil(Number(gas.data.result) / 1e9);

// 		// const ethGas = await axios.post(networks.ETH.rpc, json, { headers: { 'Content-Type': 'application/json' } });
// 		// if (ethGas?.data && ethGas?.data?.result) gasPrices.ETH = Math.ceil(Number(ethGas.data.result) / 1e9);

// 	} catch (error) {
// 		console.log('checkPrices', error);
// 	}
// }