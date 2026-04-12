const FLAG_BASE_URL = "https://flagcdn.com/w320";

const TEAM_DEFINITIONS = [
  { id: 1, name: "Qatar", code: "qa", group: "A", confederation: "AFC", titles: 0, nickname: "The Maroons", founded: "1970-01-01", info: "Host nation in 2022 and first-time World Cup participant." },
  { id: 2, name: "Ecuador", code: "ec", group: "A", confederation: "CONMEBOL", titles: 0, nickname: "La Tri", founded: "1925-01-30", info: "Opened the 2022 tournament with a 2-0 win over Qatar." },
  { id: 3, name: "Senegal", code: "sn", group: "A", confederation: "CAF", titles: 0, nickname: "The Lions of Teranga", founded: "1960-08-01", info: "Reached the 2022 knockout stage from Group A." },
  { id: 4, name: "Netherlands", code: "nl", group: "A", confederation: "UEFA", titles: 0, nickname: "Oranje", founded: "1889-12-08", info: "Won Group A before reaching the quarter-finals." },
  { id: 5, name: "England", code: "gb-eng", group: "B", confederation: "UEFA", titles: 1, nickname: "The Three Lions", founded: "1863-10-26", info: "Led Group B with nine goals scored in the group stage." },
  { id: 6, name: "Iran", code: "ir", group: "B", confederation: "AFC", titles: 0, nickname: "Team Melli", founded: "1920-01-01", info: "Won once in Group B but missed the knockouts." },
  { id: 7, name: "United States", code: "us", group: "B", confederation: "CONCACAF", titles: 0, nickname: "USMNT", founded: "1913-04-05", info: "Finished second in Group B and reached the round of 16." },
  { id: 8, name: "Wales", code: "wales", group: "B", confederation: "UEFA", titles: 0, nickname: "The Dragons", founded: "1876-03-25", info: "Returned to the World Cup for the first time since 1958." },
  { id: 9, name: "Argentina", code: "ar", group: "C", confederation: "CONMEBOL", titles: 3, nickname: "La Albiceleste", founded: "1893-02-21", info: "Won the 2022 World Cup after beating France on penalties in the final." },
  { id: 10, name: "Saudi Arabia", code: "sa", group: "C", confederation: "AFC", titles: 0, nickname: "The Green Falcons", founded: "1956-10-31", info: "Produced one of the shocks of the tournament by beating Argentina." },
  { id: 11, name: "Mexico", code: "mx", group: "C", confederation: "CONCACAF", titles: 0, nickname: "El Tri", founded: "1927-08-23", info: "Missed the knockout round on goal difference." },
  { id: 12, name: "Poland", code: "pl", group: "C", confederation: "UEFA", titles: 0, nickname: "The White and Reds", founded: "1919-12-20", info: "Reached the knockouts for the first time since 1986." },
  { id: 13, name: "France", code: "fr", group: "D", confederation: "UEFA", titles: 2, nickname: "Les Bleus", founded: "1919-04-07", info: "Reached a second straight World Cup final in 2022." },
  { id: 14, name: "Australia", code: "au", group: "D", confederation: "AFC", titles: 0, nickname: "The Socceroos", founded: "1961-01-01", info: "Advanced from Group D and pushed Argentina in the round of 16." },
  { id: 15, name: "Denmark", code: "dk", group: "D", confederation: "UEFA", titles: 0, nickname: "Danish Dynamite", founded: "1889-05-18", info: "Entered 2022 unbeaten in qualifying but finished bottom of Group D." },
  { id: 16, name: "Tunisia", code: "tn", group: "D", confederation: "CAF", titles: 0, nickname: "The Eagles of Carthage", founded: "1957-03-29", info: "Beat France but still exited in the group stage." },
  { id: 17, name: "Spain", code: "es", group: "E", confederation: "UEFA", titles: 1, nickname: "La Roja", founded: "1913-09-29", info: "Opened with a 7-0 win before exiting on penalties to Morocco." },
  { id: 18, name: "Costa Rica", code: "cr", group: "E", confederation: "CONCACAF", titles: 0, nickname: "Los Ticos", founded: "1921-06-13", info: "Recovered from a heavy opening defeat to stay alive until the final matchday." },
  { id: 19, name: "Germany", code: "de", group: "E", confederation: "UEFA", titles: 4, nickname: "Die Mannschaft", founded: "1900-01-28", info: "Went out in the group stage for a second straight World Cup." },
  { id: 20, name: "Japan", code: "jp", group: "E", confederation: "AFC", titles: 0, nickname: "Samurai Blue", founded: "1921-09-10", info: "Beat both Germany and Spain to win Group E." },
  { id: 21, name: "Belgium", code: "be", group: "F", confederation: "UEFA", titles: 0, nickname: "The Red Devils", founded: "1895-09-01", info: "Finished third in Group F and exited early." },
  { id: 22, name: "Canada", code: "ca", group: "F", confederation: "CONCACAF", titles: 0, nickname: "Les Rouges", founded: "1912-05-24", info: "Returned to the World Cup for the first time since 1986." },
  { id: 23, name: "Morocco", code: "ma", group: "F", confederation: "CAF", titles: 0, nickname: "Atlas Lions", founded: "1955-11-16", info: "Became the first African team to reach a World Cup semi-final." },
  { id: 24, name: "Croatia", code: "hr", group: "F", confederation: "UEFA", titles: 0, nickname: "Vatreni", founded: "1912-06-13", info: "Won consecutive knockout penalty shootouts and finished third." },
  { id: 25, name: "Brazil", code: "br", group: "G", confederation: "CONMEBOL", titles: 5, nickname: "Selecao", founded: "1914-06-08", info: "Won Group G and scored four in the round of 16." },
  { id: 26, name: "Serbia", code: "rs", group: "G", confederation: "UEFA", titles: 0, nickname: "The Eagles", founded: "1919-01-01", info: "Finished bottom of Group G in a high-scoring section." },
  { id: 27, name: "Switzerland", code: "ch", group: "G", confederation: "UEFA", titles: 0, nickname: "Nati", founded: "1895-04-07", info: "Finished second in Group G and then lost to Portugal." },
  { id: 28, name: "Cameroon", code: "cm", group: "G", confederation: "CAF", titles: 0, nickname: "Indomitable Lions", founded: "1959-01-01", info: "Signed off by beating Brazil in the final group match." },
  { id: 29, name: "Portugal", code: "pt", group: "H", confederation: "UEFA", titles: 0, nickname: "A Selecao", founded: "1914-03-31", info: "Won Group H and hit six against Switzerland in the round of 16." },
  { id: 30, name: "Ghana", code: "gh", group: "H", confederation: "CAF", titles: 0, nickname: "The Black Stars", founded: "1957-01-01", info: "Returned to the World Cup after missing the 2018 edition." },
  { id: 31, name: "Uruguay", code: "uy", group: "H", confederation: "CONMEBOL", titles: 2, nickname: "La Celeste", founded: "1900-03-30", info: "Won on matchday three but still went out on goals scored." },
  { id: 32, name: "South Korea", code: "kr", group: "H", confederation: "AFC", titles: 0, nickname: "The Taegeuk Warriors", founded: "1928-09-01", info: "Reached the knockouts with a late win over Portugal." },
];

const GROUP_STANDINGS = {
  A: [
    [4, 3, 2, 1, 0, 5, 1, 4, 7],
    [3, 3, 2, 0, 1, 5, 4, 1, 6],
    [2, 3, 1, 1, 1, 4, 3, 1, 4],
    [1, 3, 0, 0, 3, 1, 7, -6, 0],
  ],
  B: [
    [5, 3, 2, 1, 0, 9, 2, 7, 7],
    [7, 3, 1, 2, 0, 2, 1, 1, 5],
    [6, 3, 1, 0, 2, 4, 7, -3, 3],
    [8, 3, 0, 1, 2, 1, 6, -5, 1],
  ],
  C: [
    [9, 3, 2, 0, 1, 5, 2, 3, 6],
    [12, 3, 1, 1, 1, 2, 2, 0, 4],
    [11, 3, 1, 1, 1, 2, 3, -1, 4],
    [10, 3, 1, 0, 2, 3, 5, -2, 3],
  ],
  D: [
    [13, 3, 2, 0, 1, 6, 3, 3, 6],
    [14, 3, 2, 0, 1, 3, 4, -1, 6],
    [16, 3, 1, 1, 1, 1, 1, 0, 4],
    [15, 3, 0, 1, 2, 1, 3, -2, 1],
  ],
  E: [
    [20, 3, 2, 0, 1, 4, 3, 1, 6],
    [17, 3, 1, 1, 1, 9, 3, 6, 4],
    [19, 3, 1, 1, 1, 6, 5, 1, 4],
    [18, 3, 1, 0, 2, 3, 11, -8, 3],
  ],
  F: [
    [23, 3, 2, 1, 0, 4, 1, 3, 7],
    [24, 3, 1, 2, 0, 4, 1, 3, 5],
    [21, 3, 1, 1, 1, 1, 2, -1, 4],
    [22, 3, 0, 0, 3, 2, 7, -5, 0],
  ],
  G: [
    [25, 3, 2, 0, 1, 3, 1, 2, 6],
    [27, 3, 2, 0, 1, 4, 5, -1, 6],
    [28, 3, 1, 1, 1, 4, 4, 0, 4],
    [26, 3, 0, 1, 2, 5, 8, -3, 1],
  ],
  H: [
    [29, 3, 2, 0, 1, 6, 4, 2, 6],
    [32, 3, 1, 1, 1, 4, 4, 0, 4],
    [31, 3, 1, 1, 1, 2, 2, 0, 4],
    [30, 3, 1, 0, 2, 5, 7, -2, 3],
  ],
};

const FIXTURE_STAGES = [
  {
    key: "group-stage",
    name: "Group Stage",
    shortLabel: "GS",
    matches: [
      [1, "A", "2022-11-20", 1, 0, 2, 2],
      [2, "A", "2022-11-21", 3, 0, 4, 2],
      [3, "A", "2022-11-25", 1, 1, 3, 3],
      [4, "A", "2022-11-25", 4, 1, 2, 1],
      [5, "A", "2022-11-29", 2, 1, 3, 2],
      [6, "A", "2022-11-29", 4, 2, 1, 0],
      [7, "B", "2022-11-21", 5, 6, 6, 2],
      [8, "B", "2022-11-21", 7, 1, 8, 1],
      [9, "B", "2022-11-25", 8, 0, 6, 2],
      [10, "B", "2022-11-25", 5, 0, 7, 0],
      [11, "B", "2022-11-29", 8, 0, 5, 3],
      [12, "B", "2022-11-29", 6, 0, 7, 1],
      [13, "C", "2022-11-22", 9, 1, 10, 2],
      [14, "C", "2022-11-22", 11, 0, 12, 0],
      [15, "C", "2022-11-26", 12, 2, 10, 0],
      [16, "C", "2022-11-26", 9, 2, 11, 0],
      [17, "C", "2022-11-30", 12, 0, 9, 2],
      [18, "C", "2022-11-30", 10, 1, 11, 2],
      [19, "D", "2022-11-22", 15, 0, 16, 0],
      [20, "D", "2022-11-22", 13, 4, 14, 1],
      [21, "D", "2022-11-26", 16, 0, 14, 1],
      [22, "D", "2022-11-26", 13, 2, 15, 1],
      [23, "D", "2022-11-30", 14, 1, 15, 0],
      [24, "D", "2022-11-30", 16, 1, 13, 0],
      [25, "E", "2022-11-23", 19, 1, 20, 2],
      [26, "E", "2022-11-23", 17, 7, 18, 0],
      [27, "E", "2022-11-27", 20, 0, 18, 1],
      [28, "E", "2022-11-27", 17, 1, 19, 1],
      [29, "E", "2022-12-01", 20, 2, 17, 1],
      [30, "E", "2022-12-01", 18, 2, 19, 4],
      [31, "F", "2022-11-23", 23, 0, 24, 0],
      [32, "F", "2022-11-23", 21, 1, 22, 0],
      [33, "F", "2022-11-27", 21, 0, 23, 2],
      [34, "F", "2022-11-27", 24, 4, 22, 1],
      [35, "F", "2022-12-01", 24, 0, 21, 0],
      [36, "F", "2022-12-01", 22, 1, 23, 2],
      [37, "G", "2022-11-24", 27, 1, 28, 0],
      [38, "G", "2022-11-24", 25, 2, 26, 0],
      [39, "G", "2022-11-28", 28, 3, 26, 3],
      [40, "G", "2022-11-28", 25, 1, 27, 0],
      [41, "G", "2022-12-02", 26, 2, 27, 3],
      [42, "G", "2022-12-02", 28, 1, 25, 0],
      [43, "H", "2022-11-24", 31, 0, 32, 0],
      [44, "H", "2022-11-24", 29, 3, 30, 2],
      [45, "H", "2022-11-28", 32, 2, 30, 3],
      [46, "H", "2022-11-28", 29, 2, 31, 0],
      [47, "H", "2022-12-02", 32, 2, 29, 1],
      [48, "H", "2022-12-02", 30, 0, 31, 2],
    ],
  },
  {
    key: "round-of-16",
    name: "Round of 16",
    shortLabel: "R16",
    matches: [
      [49, null, "2022-12-03", 4, 3, 7, 1],
      [50, null, "2022-12-03", 9, 2, 14, 1],
      [51, null, "2022-12-04", 13, 3, 12, 1],
      [52, null, "2022-12-04", 5, 3, 3, 0],
      [53, null, "2022-12-05", 20, 1, 24, 1, 24, "Croatia won 3-1 on penalties."],
      [54, null, "2022-12-05", 25, 4, 32, 1],
      [55, null, "2022-12-06", 23, 0, 17, 0, 23, "Morocco won 3-0 on penalties."],
      [56, null, "2022-12-06", 29, 6, 27, 1],
    ],
  },
  {
    key: "quarterfinals",
    name: "Quarter-finals",
    shortLabel: "QF",
    matches: [
      [57, null, "2022-12-09", 24, 1, 25, 1, 24, "Croatia won 4-2 on penalties."],
      [58, null, "2022-12-09", 4, 2, 9, 2, 9, "Argentina won 4-3 on penalties."],
      [59, null, "2022-12-10", 23, 1, 29, 0],
      [60, null, "2022-12-10", 5, 1, 13, 2],
    ],
  },
  {
    key: "semifinals",
    name: "Semi-finals",
    shortLabel: "SF",
    matches: [
      [61, null, "2022-12-13", 9, 3, 24, 0],
      [62, null, "2022-12-14", 13, 2, 23, 0],
    ],
  },
  {
    key: "third-place",
    name: "Third-place Play-off",
    shortLabel: "3P",
    matches: [
      [63, null, "2022-12-17", 24, 2, 23, 1],
    ],
  },
  {
    key: "final",
    name: "Final",
    shortLabel: "F",
    matches: [
      [64, null, "2022-12-18", 9, 3, 13, 3, 9, "Argentina won 4-2 on penalties."],
    ],
  },
];

const HEAD_TO_HEAD_HISTORY = {
  "9:13": [
    { id: 1001, eventName: "FIFA World Cup 2018", scheduledDate: "2018-06-30", score1: 3, score2: 4, player1Id: 9, player2Id: 13, winnerId: 13 },
    { id: 1002, eventName: "FIFA World Cup 2022", scheduledDate: "2022-12-18", score1: 3, score2: 3, player1Id: 9, player2Id: 13, winnerId: 9, note: "Argentina won on penalties." },
  ],
  "24:25": [
    { id: 1003, eventName: "FIFA World Cup 2014", scheduledDate: "2014-06-12", score1: 1, score2: 3, player1Id: 24, player2Id: 25, winnerId: 25 },
    { id: 1004, eventName: "FIFA World Cup 2022", scheduledDate: "2022-12-09", score1: 1, score2: 1, player1Id: 24, player2Id: 25, winnerId: 24, note: "Croatia won on penalties." },
  ],
};

const teamById = new Map(
  TEAM_DEFINITIONS.map((team) => [team.id, team]),
);

function flagUrlForTeamCode(code) {
  const normalised = String(code || "").toLowerCase();
  if (normalised === "gb-eng") {
    return "https://upload.wikimedia.org/wikipedia/en/b/be/Flag_of_England.svg";
  }
  if (normalised === "wales") {
    return "https://upload.wikimedia.org/wikipedia/commons/d/dc/Flag_of_Wales.svg";
  }
  return `${FLAG_BASE_URL}/${normalised}.png`;
}

function createEntrantFromTeam(teamId, extra = {}) {
  const team = teamById.get(teamId);
  if (!team) {
    throw new Error(`Unknown team id ${teamId}`);
  }

  return {
    id: team.id,
    name: team.name,
    nationality: team.name,
    photo: flagUrlForTeamCode(team.code),
    shortName: team.name,
    nickname: team.nickname,
    born: team.founded,
    twitter: "",
    websiteUrl: "",
    info: `${team.info} Confederation: ${team.confederation}. Group ${team.group}.`,
    photoSource: "Flag image",
    firstSeasonAsPro: 0,
    lastSeasonAsPro: 0,
    numRankingTitles: team.titles,
    numMaximums: 0,
    confederation: team.confederation,
    group: team.group,
    ...extra,
  };
}

function buildMatch(stageKey, matchData) {
  const [id, group, scheduledDate, player1Id, score1, player2Id, score2, explicitWinnerId = null, note = ""] = matchData;
  const player1 = createEntrantFromTeam(player1Id);
  const player2 = createEntrantFromTeam(player2Id);
  const winnerId = explicitWinnerId || (score1 > score2 ? player1Id : score2 > score1 ? player2Id : null);
  const decisionMethod = /penalt/i.test(note)
    ? "penalties"
    : /extra time/i.test(note)
      ? "extra-time"
      : winnerId
        ? "regulation"
        : "draw";

  return {
    id,
    group,
    number: id,
    scheduledDate,
    startDate: scheduledDate,
    endDate: scheduledDate,
    tableNo: 0,
    winnerId,
    unfinished: false,
    note,
    decisionMethod,
    penaltyScore: null,
    detailsUrl: "",
    liveUrl: "",
    player1: {
      ...player1,
      score: score1,
      isPlaceholder: false,
    },
    player2: {
      ...player2,
      score: score2,
      isPlaceholder: false,
    },
    stageKey,
  };
}

function buildRound(round, order) {
  const matches = round.matches.map((match) => buildMatch(round.key, match));
  const entrantsLeftLookup = {
    "round-of-16": 16,
    quarterfinals: 8,
    semifinals: 4,
    final: 2,
  };

  return {
    id: 100 + order,
    key: round.key,
    name: round.name,
    shortLabel: round.shortLabel,
    entrantsLeft: entrantsLeftLookup[round.key] || matches.length * 2,
    order,
    matchCount: matches.length,
    matches,
  };
}

function buildFixtureStage(stage, order) {
  return {
    id: 200 + order,
    key: stage.key,
    name: stage.name,
    shortLabel: stage.shortLabel,
    order,
    matchCount: stage.matches.length,
    matches: stage.matches.map((match) => buildMatch(stage.key, match)),
  };
}

function buildGroups() {
  const groupStage = FIXTURE_STAGES.find((stage) => stage.key === "group-stage");
  const groupFixtures = groupStage?.matches || [];

  return Object.entries(GROUP_STANDINGS).map(([groupName, rows]) => ({
    key: groupName,
    name: `Group ${groupName}`,
    standings: rows.map(([teamId, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference, points], index) => ({
      position: index + 1,
      team: createEntrantFromTeam(teamId),
      played,
      won,
      drawn,
      lost,
      goalsFor,
      goalsAgainst,
      goalDifference,
      points,
    })),
    fixtures: groupFixtures
      .filter((fixture) => fixture[1] === groupName)
      .map((match) => buildMatch("group-stage", match)),
  }));
}

function buildKnockoutEntrants() {
  const eliminationRoundByTeamId = new Map([
    [7, "round-of-16"],
    [14, "round-of-16"],
    [12, "round-of-16"],
    [3, "round-of-16"],
    [20, "round-of-16"],
    [32, "round-of-16"],
    [17, "round-of-16"],
    [27, "round-of-16"],
    [25, "quarterfinals"],
    [4, "quarterfinals"],
    [29, "quarterfinals"],
    [5, "quarterfinals"],
    [24, "semifinals"],
    [23, "semifinals"],
    [13, "final"],
  ]);

  const winners = [4, 5, 9, 13, 20, 23, 25, 29];
  const runnersUp = [3, 7, 12, 14, 17, 24, 27, 32];
  const knockoutTeams = [...winners, ...runnersUp];

  return knockoutTeams.map((teamId) => {
    const isSeed = winners.includes(teamId);
    const ranking = isSeed ? winners.indexOf(teamId) + 1 : runnersUp.indexOf(teamId) + 1;
    const eliminationRoundKey = eliminationRoundByTeamId.get(teamId) || null;
    const eliminationRoundId = eliminationRoundKey
      ? {
        "round-of-16": 101,
        quarterfinals: 102,
        semifinals: 103,
        final: 104,
      }[eliminationRoundKey]
      : null;
    return createEntrantFromTeam(teamId, {
      seedNumber: ranking,
      isSeed,
      score: 0,
      eliminatedInRoundId: eliminationRoundId,
      isPlaceholder: false,
      isChampion: teamId === 9,
    });
  });
}

function buildHeadToHead(player1Id, player2Id) {
  const orderedIds = [Number(player1Id), Number(player2Id)].sort((left, right) => left - right);
  const key = `${orderedIds[0]}:${orderedIds[1]}`;
  const matches = (HEAD_TO_HEAD_HISTORY[key] || []).map((match) => ({ ...match }));

  return {
    competitionLabel: "FIFA World Cup meetings",
    matches,
    summary: {
      totalMatches: matches.length,
      player1Wins: matches.filter((match) => match.winnerId === Number(player1Id)).length,
      player2Wins: matches.filter((match) => match.winnerId === Number(player2Id)).length,
    },
  };
}

export function buildStaticWorldCupSnapshot(targetYear) {
  const year = Number(targetYear);
  const knockoutRounds = FIXTURE_STAGES
    .filter((stage) => ["round-of-16", "quarterfinals", "semifinals", "final"].includes(stage.key))
    .map((stage, index) => buildRound(stage, index + 1));
  const fixtureStages = FIXTURE_STAGES.map((stage, index) => buildFixtureStage(stage, index + 1));
  const entrants = buildKnockoutEntrants();
  const groups = buildGroups();

  return {
    year,
    eventId: 202200,
    eventName: "FIFA World Cup Qatar 2022",
    eventDates: { start: "2022-11-20", end: "2022-12-18" },
    sampleDataYear: 2022,
    dataSourceMode: "static",
    dataSourceLabel: "Static FIFA World Cup 2022 results",
    dataSourceUrl: "https://www.fifa.com/tournaments/mens/worldcup/qatar2022",
    entrants,
    seeds: entrants.filter((entry) => entry.isSeed),
    qualifiers: entrants.filter((entry) => !entry.isSeed),
    allTeams: TEAM_DEFINITIONS.map((team) => createEntrantFromTeam(team.id)),
    groups,
    fixtureStages,
    rounds: knockoutRounds,
  };
}

export function buildUpcomingWorldCupSnapshot(targetYear) {
  const year = Number(targetYear);
  const fixtureStages = [
    { id: 201, key: "group-stage", name: "Group Stage", shortLabel: "GS", order: 1, matchCount: 0, matches: [] },
    { id: 202, key: "round-of-16", name: "Round of 16", shortLabel: "R16", order: 2, matchCount: 0, matches: [] },
    { id: 203, key: "quarterfinals", name: "Quarter-finals", shortLabel: "QF", order: 3, matchCount: 0, matches: [] },
    { id: 204, key: "semifinals", name: "Semi-finals", shortLabel: "SF", order: 4, matchCount: 0, matches: [] },
    { id: 205, key: "third-place", name: "Third-place Play-off", shortLabel: "3P", order: 5, matchCount: 0, matches: [] },
    { id: 206, key: "final", name: "Final", shortLabel: "F", order: 6, matchCount: 0, matches: [] },
  ];
  const rounds = [
    { id: 101, key: "round-of-16", name: "Round of 16", shortLabel: "R16", entrantsLeft: 16, order: 1, matchCount: 0, matches: [] },
    { id: 102, key: "quarterfinals", name: "Quarter-finals", shortLabel: "QF", entrantsLeft: 8, order: 2, matchCount: 0, matches: [] },
    { id: 103, key: "semifinals", name: "Semi-finals", shortLabel: "SF", entrantsLeft: 4, order: 3, matchCount: 0, matches: [] },
    { id: 104, key: "final", name: "Final", shortLabel: "F", entrantsLeft: 2, order: 4, matchCount: 0, matches: [] },
  ];

  return {
    year,
    eventId: 202600,
    eventName: "FIFA World Cup 2026",
    eventDates: { start: "2026-06-11", end: "2026-07-19" },
    sampleDataYear: null,
    dataSourceMode: "upcoming",
    dataSourceLabel: "Tournament structure coming soon",
    dataSourceUrl: "https://www.fifa.com/tournaments/mens/worldcup/canadamexicousa2026",
    entrants: [],
    seeds: [],
    qualifiers: [],
    allTeams: [],
    groups: [],
    fixtureStages,
    rounds,
  };
}

export function buildStaticHeadToHead(player1Id, player2Id) {
  return buildHeadToHead(player1Id, player2Id);
}
