// Utility to filter only last 32 players from snooker.org API event player list

/**
 * Returns only players from the last 32 (main draw) of a snooker event.
 * @param {Array<Object>} players - List of player objects from snooker.org API
 * @returns {Array<Object>} - Filtered list
 */
function filterLast32(players) {
  // Defensive: check common fields for last-32 status
  return players.filter(p => {
    // Some APIs use RoundName, some use Pos/Seed, some use Round/RoundID
    if (p.RoundName && /last\s*32/i.test(p.RoundName)) return true;
    if (typeof p.Pos === 'number' && p.Pos <= 32) return true;
    if (typeof p.Seed === 'number' && p.Seed <= 32) return true;
    if (typeof p.Round === 'number' && p.Round === 32) return true;
    if (typeof p.RoundID === 'number' && p.RoundID === 32) return true;
    // fallback: sometimes only 32 players are in the main draw
    return false;
  });
}

export { filterLast32 };
