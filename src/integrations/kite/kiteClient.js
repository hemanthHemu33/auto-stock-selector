// src/integrations/kite/kiteClient.js
import pkg from "kiteconnect";
const KiteConnect = pkg?.KiteConnect ?? pkg?.default ?? pkg;

let kite = null;

export function getKite() {
  if (kite) return kite;
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) throw new Error("KITE_API_KEY missing");
  kite = new KiteConnect({ api_key: apiKey });
  const token = process.env.KITE_ACCESS_TOKEN;
  if (token) kite.setAccessToken(token);
  return kite;
}

export function setAccessToken(token) {
  const client = getKite();
  client.setAccessToken(token);
}
