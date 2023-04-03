import { provider, TIP } from "../constants";
import axios from "axios";

export const rpc = async (json: any) => {
    const res = await axios.post(`http://localhost:8545`, json)
    return res.data.result;
}

export const latestBlockInfo = async () => {
    try {
        let res = await rpc({ "jsonrpc": "2.0", "method": "eth_getBlockByNumber", "params": ["latest", false], "id": "0" });
        return res;
    } catch (err) {
        console.log(err.message, err.stack)
    }
}
export const calculateGasPrice = (action: any, amount: any) => {
    let number = parseInt(amount, 16);
    console.log('calculateGasPrice number : ', number);
    if (action === "buy") {
        console.log('buy number + TIP : ', number + (TIP / 2));
        return "0x" + (number + (TIP / 2)).toString(16)
    } else {
        console.log('sell number - 8 : ', number - 8);
        return "0x" + (number - 8).toString(16)
    }
}
export const checkTxType = async (transaction: any) => {
    let feeData = await provider.getFeeData();
    let buyMaxPriorityFeePerGas_: any = TIP;
    let sellMaxPriorityFeePerGas_;
    let maxFeePerGas_ = Number(feeData.maxFeePerGas);// if user tx is EIP-1559
    let TYPE = "legacy";
    try {
        if (transaction.maxFeePerGas || transaction.maxPriorityFeePerGas) {
            console.log('EIP-1559 TX : ')
            console.log('transaction.maxPriorityFeePerGas : ', transaction.maxPriorityFeePerGas)
            if (Number(transaction.maxPriorityFeePerGas) >= Number(TIP)) {
                buyMaxPriorityFeePerGas_ = calculateGasPrice("buy", transaction.maxPriorityFeePerGas);
                sellMaxPriorityFeePerGas_ = calculateGasPrice("sell", transaction.maxPriorityFeePerGas);
                maxFeePerGas_ = Number(maxFeePerGas_) + (TIP / 2);
            }
            if (Number(maxFeePerGas_) <= Number(buyMaxPriorityFeePerGas_)) {
                maxFeePerGas_ = Number(transaction.maxFeePerGas) * 2;
            }
            TYPE = "eip-1559";
        }
    } catch (error) {
        // transaction.maxFeePerGas is underfine. this is Legancy tx
        console.log('Legacy TX : ')
        if (Number(maxFeePerGas_) <= Number(TIP)) {
            maxFeePerGas_ = maxFeePerGas_ * 2;
        }
        sellMaxPriorityFeePerGas_ = sellMaxPriorityFeePerGas_;
    }
    return {
        buyMaxPriorityFeePerGas_,
        sellMaxPriorityFeePerGas_,
        maxFeePerGas_,
        TYPE
    }
}