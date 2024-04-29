const fs = require("fs");
const crypto = require("crypto");
const secp256k1 = require("secp256k1");

const mempoolDir = "./mempool";
const transactions = [];
fs.readdirSync(mempoolDir).forEach(file => {
  const filePath = `${mempoolDir}/${file}`;
  const transaction = JSON.parse(fs.readFileSync(filePath, "utf8"));
  transactions.push(transaction);
});

console.log("Total Number of transactions= ", transactions.length);

/**
 * Array to store valid transactions.
 * @type {Array}
 */
const validTransactions = [];
transactions.forEach(transaction => {
  if (validateTransaction(transaction)) {
    validTransactions.push(transaction);
  }
});

console.log("Total Number of Valid transactions= ", validTransactions.length);

/**
 * The total fees accumulated.
 * @type {number}
 */
let totalFees = 0;
validTransactions.forEach(transaction => {
  transaction.vin.forEach(input => {
    totalFees += input.prevout.value;
  });
  transaction.vout.forEach(output => {
    totalFees -= output.value;
  });
});

console.log("Total Fees= ", totalFees);

/**
 * Represents a coinbase transaction.
 *
 * @typedef {Object} CoinbaseTransaction
 * @property {number} version - The version of the transaction.
 * @property {number} locktime - The locktime of the transaction.
 * @property {Array} vin - The array of transaction inputs.
 * @property {Object} vin[].prevout - The previous output of the transaction input.
 * @property {string} vin[].prevout.txid - The transaction ID of the previous output.
 * @property {number} vin[].prevout.value - The value of the previous output.
 * @property {Array} vout - The array of transaction outputs.
 * @property {string} vout[].scriptpubkey - The script public key of the transaction output.
 * @property {string} vout[].scriptpubkey_asm - The assembly representation of the script public key.
 * @property {string} vout[].scriptpubkey_type - The type of the script public key.
 * @property {string} vout[].scriptpubkey_address - The address associated with the script public key.
 * @property {number} vout[].value - The value of the transaction output.
 */
const coinbaseTransaction = {
  version: 1,
  locktime: 0,
  vin: [{
    prevout: {
      txid: "0000000000000000000000000000000000000000000000000000000000000000",
      value: 2500000 + totalFees // 25 BTC reward + total transaction fees
    }
  }],
  vout: [
    {
      scriptpubkey: "76a9146085312a9c500ff9cc35b571b0a1e5efb7fb9f1688ac",
      scriptpubkey_asm: "OP_DUP OP_HASH160 OP_PUSHBYTES_20 6085312a9c500ff9cc35b571b0a1e5efb7fb9f16 OP_EQUALVERIFY OP_CHECKSIG",
      scriptpubkey_type: "p2pkh",
      scriptpubkey_address: "19oMRmCWMYuhnP5W61ABrjjxHc6RphZh11",
      value: 0
    }
  ]
};

/**
 * Represents a block header.
 *
 * @typedef {Object} BlockHeader
 * @property {number} version - The version of the block.
 * @property {string} prevBlockHash - The hash of the previous block.
 * @property {string} merkleRoot - The root hash of the Merkle tree.
 * @property {number} timestamp - The timestamp of the block.
 * @property {string} bits - The difficulty target of the block.
 * @property {number} nonce - The nonce value of the block.
 */
const blockHeader = {
  version: 1,
  prevBlockHash: "0000000000000000000000000000000000000000000000000000000000000000",
  merkleRoot: getMerkleRoot(validTransactions.concat([coinbaseTransaction])),
  timestamp: Math.floor(Date.now() / 1000),
  bits: "0000ffff00000000000000000000000000000000000000000000000000000000", // difficulty target
  nonce: 0
};

/**
 * The hash value of the block.
 * @type {string}
 */
let blockHash;
do {
  blockHash = getBlockHash(blockHeader);
  blockHeader.nonce++;
} while (blockHash > 0x0000ffff000000000000000000000000000000000000000000000000000000000);

// Write output to file
const outputFile = "output.txt";
fs.writeFileSync(outputFile, `${getBlockHeaderString(blockHeader)}
`);
fs.appendFileSync(outputFile, `${getTransactionString(coinbaseTransaction)}
`);
validTransactions.forEach(transaction => {
  fs.appendFileSync(outputFile, `${getTransactionString(transaction)}
`);
});


/**
 * Validates a transaction object.
 *
 * @param {object} transaction - The transaction object to validate.
 * @returns {boolean} - Returns true if the transaction is valid, false otherwise.
 */
function validateTransaction(transaction) {
  try {
    const vin = transaction.vin || [];
    const vout = transaction.vout || [];

    // Validate each input (vin)
    for (const input of vin) {
      const prevout = input.prevout || {};
      const scriptpubkey_type = prevout.scriptpubkey_type || '';
      const scriptpubkey_address = prevout.scriptpubkey_address || '';
      const value = prevout.value || 0;

      // Perform basic checks on input
      if (!['v0_p2wpkh', 'v1_p2tr'].includes(scriptpubkey_type)) { // Valid scriptpubkey types
        return false;
      }
      if (!scriptpubkey_address.startsWith('bc1')) { // Valid Bitcoin address format
        return false;
      }
      if (value <= 0) { // Positive value for input
        return false;
      }
    }

    // Validate each output (vout)
    for (const output of vout) {
      const scriptpubkey_type = output.scriptpubkey_type || '';
      const scriptpubkey_address = output.scriptpubkey_address || '';
      const value = output.value || 0;

      // Perform basic checks on output
      if (!['v0_p2wpkh', 'v1_p2tr'].includes(scriptpubkey_type)) { // Valid scriptpubkey types
        return false;
      }
      if (!scriptpubkey_address.startsWith('bc1')) { // Valid Bitcoin address format
        return false;
      }
      if (value <= 0) { // Positive value for output
        return false;
      }
    }

    return true; // Transaction is valid if all checks pass

  } catch (e) {
    console.log("Error validating transaction: " + e.toString());
    return false;
  }
}

/**
 * Calculates the Merkle root of an array of transactions.
 *
 * @param {Array} transactions - The array of transactions.
 * @returns {string} - The Merkle root.
 */
function getMerkleRoot(transactions) {
  const hashes = transactions.map(transaction => {
    const txHash = crypto.createHash("sha256");
    txHash.update(JSON.stringify(transaction));
    return txHash.digest("hex");
  });

  function merkleRoot(hashes) {
    if (hashes.length === 1) {
      return hashes[0];
    }

    const newHashes = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const hash1 = hashes[i];
      const hash2 = hashes[i + 1] || hash1;
      const combinedHash = crypto.createHash("sha256");
      combinedHash.update(Buffer.concat([Buffer.from(hash1, "hex"), Buffer.from(hash2, "hex")]));
      newHashes.push(combinedHash.digest("hex"));
    }

    return merkleRoot(newHashes);
  }

  return merkleRoot(hashes);
}

/**
 * Calculates the hash of a block header.
 *
 * @param {Object} blockHeader - The block header object.
 * @param {number} blockHeader.version - The version of the block.
 * @param {string} blockHeader.prevBlockHash - The hash of the previous block.
 * @param {string} blockHeader.merkleRoot - The Merkle root of the block.
 * @param {number} blockHeader.timestamp - The timestamp of the block.
 * @param {string} blockHeader.bits - The difficulty target of the block.
 * @param {number} blockHeader.nonce - The nonce value of the block.
 * @returns {string} - The hash of the block header.
 */
function getBlockHash(blockHeader) {
  const blockHeaderBuffer = Buffer.concat([
    Buffer.from(blockHeader.version.toString(), "hex"),
    Buffer.from(blockHeader.prevBlockHash, "hex"),
    Buffer.from(blockHeader.merkleRoot, "hex"),
    Buffer.from(blockHeader.timestamp.toString(), "hex"),
    Buffer.from(blockHeader.bits, "hex"),
    Buffer.from(blockHeader.nonce.toString(), "hex")
  ]);
  const blockHash = crypto.createHash("sha256");
  blockHash.update(blockHeaderBuffer);
  return crypto.createHash("sha256").update(blockHash.digest()).digest("hex");
}

/**
 * Returns a string representation of the block header.
 *
 * @param {Object} blockHeader - The block header object.
 * @returns {string} The string representation of the block header.
 */
function getBlockHeaderString(blockHeader) {
  return `${blockHeader.version} ${blockHeader.prevBlockHash} ${blockHeader.merkleRoot} ${blockHeader.timestamp} ${blockHeader.bits} ${blockHeader.nonce}`;
}

/**
 * Converts a transaction object to a JSON string.
 *
 * @param {Object} transaction - The transaction object to convert.
 * @returns {string} The JSON string representation of the transaction.
 */
function getTransactionString(transaction) {
  return JSON.stringify(transaction);
}
