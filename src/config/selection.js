export default {
  watchlist: ["ADANIPOWER","ADANIGREEN","ADANIENT","RPOWER","GSFC"],
  filters: {
    minAvg1mVol: 200000,
    maxSpreadPct: 0.35,
    banList: []
  },
  weights: {
    sentiment: 0.35,
    catalyst:  0.20,
    momentum:  0.20,
    liquidity: 0.10,
    fundamentals: 0.15
  },
  schedulesIST: {
    preopen1: "35 8 * * 1-5",
    preopen2: "14 9 * * 1-5",
    midday1:  "30 12 * * 1-5",
    midday2:  "0 14 * * 1-5"
  }
};
