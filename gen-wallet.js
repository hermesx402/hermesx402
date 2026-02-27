const { Keypair } = require('@solana/web3.js');
const kp = Keypair.generate();
console.log('PUBLIC:', kp.publicKey.toBase58());
console.log('SECRET:', JSON.stringify(Array.from(kp.secretKey)));
