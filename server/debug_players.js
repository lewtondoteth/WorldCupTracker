// Debug utility to log the first player object from snooker.org API for /api/players/2024
import fetch from "node-fetch";
const SN_API = "https://api.snooker.org";
const SN_HEADER = { "X-Requested-By": "NicholasAndroidApp" };

async function main() {
  const url = `${SN_API}/?t=9&e=1460`;
  const r = await fetch(url, { headers: SN_HEADER });
  const data = await r.json();
  console.log("First player:", data[0]);
  console.log("Total players:", data.length);
}
main();
