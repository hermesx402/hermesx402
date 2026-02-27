const { Connection, PublicKey } = require('@solana/web3.js');
const c = new Connection('https://api.mainnet-beta.solana.com');
c.getBalance(new PublicKey('GBtv9snKwP1j3TvL7vkDPM8enogNT2L9bcYWCBBdgAMh'))
  .then(b => console.log(b / 1e9, 'SOL'));
