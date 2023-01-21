import AWS from 'aws-sdk';
import axios from 'axios';
const path = require('path');
const sheets = require('@googleapis/sheets');

const bossTargets = require('../../data/dungeon-level-targets.json');

AWS.config.update({ region: 'us-east-1' });

const S3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

//TODO: Add User-Agent to environment Variables.
const {
  TABLE_NAME,
  GUILD_TAG,
  GUILD_ID,
  USER_ID,
  INSTALL_ID,
  CONFIG_BUCKET,
  CONFIG_FILE,
  GOOGLE_SPREADSHEET,
} = process.env;

const updateLastGuildEventsTable = async (circuit, lastGuildBossEventId) => {
  const params = {
    RequestItems: {
      [TABLE_NAME]: [
        {
          PutRequest: {
            Item: {
              guildEventMode: 'lastRecordedDungeonRound',
              round: circuit,
            },
          },
        },
        {
          PutRequest: {
            Item: {
              guildEventMode: 'lastGuildBossEventId',
              eventId: lastGuildBossEventId,
            },
          },
        },
      ],
    },
  };

  let response = await dynamodb.batchWrite(params).promise();
  console.log(response);
};

const readFile = async (bucket: String, key: String) => {
  const params = {
    Bucket: bucket,
    Key: key,
  };

  try {
    const response = await S3.getObject(params).promise();
    // console.log(JSON.parse(response.Body.toString('utf-8')))
    return JSON.parse(response.Body.toString('utf-8'));
  } catch (err) {
    return {
      statusCode: err.statusCode || 400,
      body: err.message || JSON.stringify(err.message),
    };
  }
};

const getLeaderboardCurrentTierSet = async (sessionId, configValues) => {
  const snowprintURL = `https://api-live.thor.snowprintstudios.com/player/player2/userId/`;

  const getGuildSeasonLeaderboard2 = JSON.stringify({
    builtInMultiConfigVersion: configValues.builtInMultiConfigVersion,
    installId: INSTALL_ID,
    playerEvent: {
      createdOn: `${Date.now()}`,
      gameConfigVersion: configValues.gameConfigVersion,
      multiConfigVersion: configValues.multiConfigVersion,
      playerEventData: {
        guildId: GUILD_ID,
      },
      playerEventType: 'GET_GUILD_SEASON_LEADERBOARD_2',
      universeVersion: '52AB1265BA18205FFD9D57B2274317D8',
    },
  });

  try {
    const response = await axios.post(
      `${snowprintURL}${USER_ID}/sessionId/${sessionId}`,
      getGuildSeasonLeaderboard2,
      {
        headers: {
          Host: 'api-live.snowprintstudios.com',
          'Content-Type': 'application/json',
          'User-Agent': 'solgard/984 CFNetwork/1329 Darwin/21.3.0',
          Connection: 'keep-alive',
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Content-Length': getGuildSeasonLeaderboard2.length,
          // 'Accept-Encoding':'gzip',
          'X-Unity-Version': '2019.2.21f1',
        },
      }
    );

    // CHECK FOR THE TOP VS. LOCAL DIFFERENCES HERE... LOCAL works... but might be good to consider "top"
    const guildState =
      response.data.eventResult.eventResponseData.leaderboard.local.find(
        (guild) => {
          return guild.guildTag === GUILD_TAG;
        }
      );
    // console.log(guildState)
    const currentLeaderboardSeason =
      response.data.eventResult.eventResponseData.leaderboard.season + 1;

    const circuit = !guildState.loopIndex
      ? guildState.tierReached
        ? Math.floor(guildState.tierReached / 5 + 1)
        : 1
      : Math.floor(guildState.tierReached / 5 + 1) + guildState.loopIndex;

    return { currentLeaderboardSeason, circuit };
  } catch (error) {
    console.error(error);
  }
};

const getBossData = async (
  sessionId: String,
  configValues: Object,
  lastRecordedEvent: number,
  lastRecordedDungeonRound: number,
  currentLeaderboardSeason: number,
  circuit: number
) => {
  // console.log(sessionId, lastRecordedEvent, lastRecordedDungeonRound, currentLeaderboardSeason, circuit)

  const eventsURL = `https://channel-live.thor.snowprintstudios.com/events/lp/userId/${USER_ID}/sessionId/${sessionId}`;

  const channelData = JSON.stringify({
    channels: [
      {
        name: 'guildboss',
        seq: 0,
      },
    ],
    gameConfigVersion: configValues.gameConfigVersion,
    multiConfigVersion: configValues.multiConfigVersion,
  });

  const response = await axios.post(eventsURL, channelData, {
    headers: {
      Host: 'channel-live.snowprintstudios.com',
      'Content-Type': 'application/json',
      'User-Agent': 'solgard/984 CFNetwork/1329 Darwin/21.3.0',
      Connection: 'keep-alive',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Length': channelData.length,
      // 'Accept-Encoding':'gzip',
      'X-Unity-Version': '2019.2.21f1',
    },
  });

  const guildBossData = response.data.events.guildboss;

  const lastEventSeq = guildBossData[guildBossData.length - 1].seq;
  console.log(`Last Event Seq: ${lastEventSeq}`);

  const condensedBattlesBossOrder = guildBossData.filter(
    (event) =>
      event.type === 'GuildBossEncounterCompleted' &&
      event.data.damageType === 'Battle' &&
      event.seq > lastRecordedEvent
  );

  condensedBattlesBossOrder.length
    ? condensedBattlesBossOrder.map((battle) => {
        return battle.data.levelId
          ? parseInt(battle.data.levelId.slice(-8, -3).replace(/_+/g, ' '))
          : null;
      })
    : [];

  const minOfCondensedBattlesBossOrder = condensedBattlesBossOrder.length
    ? Math.min(...condensedBattlesBossOrder)
    : [];

  const indexOfMinCondensedBattlesBossOrder = condensedBattlesBossOrder.indexOf(
    minOfCondensedBattlesBossOrder
  );

  const newBossBattles = guildBossData.filter(
    (event) =>
      event.type === 'GuildBossEncounterCompleted' &&
      event.data.damageType === 'Battle' &&
      event.seq > lastRecordedEvent
  );

  const guildBossBattles = newBossBattles.length
    ? newBossBattles.map((battle, index) => {
        let round;

        if (lastRecordedDungeonRound >= circuit) {
          round = circuit;
        }

        if (lastRecordedDungeonRound < circuit) {
          index < indexOfMinCondensedBattlesBossOrder ||
          (battle.data.levelId !== null &&
            battle.data.levelId.slice(-6, -3) === '004')
            ? (round = lastRecordedDungeonRound)
            : (round = circuit);
        }

        // console.log(battle.seq, battle.data.damageDealt, round, battle.data.levelId )
        return {
          eventId: battle.eventId,
          timestamp: battle.timestamp,
          player: battle.data.user.displayName,
          userId: battle.data.user.userId,
          damage: battle.data.damageDealt,
          guildBossEncounterType: battle.data.guildBossEncounterType,
          levelId: battle.data.levelId ? battle.data.levelId : null,
          maxTurnsReached: battle.data.maxTurnsReached,
          finished: battle.data.currentHp === 0 ? true : false,
          season: currentLeaderboardSeason,
          circuit: round,
          world:
            battle.data.levelId !== null
              ? parseInt(battle.data.levelId.slice(-8, -7))
              : null,
          boss:
            battle.data.levelId !== null
              ? `${round}_${bossTargets[battle.data.levelId].boss}`
              : null,
          target:
            battle.data.levelId !== null
              ? `${round}_${bossTargets[battle.data.levelId].target}`
              : null,
          date: new Date(battle.timestamp).toLocaleDateString('en-US', {
            timeZone: 'America/New_York',
          }),
          seq: battle.seq,
        };
      })
    : [];

  const condensedBombsBossOrder = guildBossData.filter(
    (event) =>
      event.type === 'GuildBossEncounterCompleted' &&
      event.data.damageType === 'Bomb' &&
      event.seq > lastRecordedEvent
  );
  condensedBombsBossOrder.length
    ? condensedBombsBossOrder.map((bomb) => {
        return parseInt(bomb.data.levelId.slice(-8, -3).replace(/_+/g, ' '));
      })
    : [];

  // console.log(condensedBombsBossOrder)

  const minOfCondensedBombsBossOrder = condensedBombsBossOrder.length
    ? Math.min(...condensedBombsBossOrder)
    : [];
  // console.log(minOfCondensedBattlesBossOrder)

  const indexOfMinCondensedBombsBossOrder = condensedBombsBossOrder.indexOf(
    minOfCondensedBombsBossOrder
  );
  // console.log(indexOfMinCondensedBombsBossOrder)

  const newBossBombs = guildBossData.filter(
    (event) =>
      event.type === 'GuildBossEncounterCompleted' &&
      event.data.damageType === 'Bomb' &&
      event.seq > lastRecordedEvent
  );

  const guildBossBombs = newBossBombs.length
    ? newBossBombs.map((bomb, index) => {
        let round;

        if (lastRecordedDungeonRound >= circuit) {
          round = circuit;
        }

        if (lastRecordedDungeonRound < circuit) {
          index < indexOfMinCondensedBombsBossOrder ||
          bomb.data.levelId.slice(-6, -3) === '004'
            ? (round = lastRecordedDungeonRound)
            : (round = circuit);
        }
        // console.log(bomb.seq, bomb.data.damageDealt, round, bomb.data.levelId )

        return {
          eventId: bomb.eventId,
          timestamp: bomb.timestamp,
          player: bomb.data.user.displayName,
          userId: bomb.data.user.userId,
          damage: bomb.data.damageDealt,
          guildBossEncounterType: bomb.data.guildBossEncounterType,
          levelId: bomb.data.levelId,
          date: new Date(bomb.timestamp).toLocaleDateString('en-US', {
            timeZone: 'America/New_York',
          }),
          season: currentLeaderboardSeason,
          circuit: round,
          world: parseInt(bomb.data.levelId.slice(-8, -7)),
          boss: `${round}_${bossTargets[bomb.data.levelId].boss}`,
          target: `${round}_${bossTargets[bomb.data.levelId].target}`,
          seq: bomb.seq,
        };
      })
    : [];

  const battlesMappedForSheets = guildBossBattles.length
    ? guildBossBattles.map((battle) => {
        return [
          battle.eventId,
          battle.timestamp,
          battle.player,
          battle.damage,
          battle.guildBossEncounterType,
          battle.levelId,
          battle.maxTurnsReached,
          battle.finished,
          battle.date,
          battle.season,
          battle.circuit,
          battle.world,
          battle.boss,
          battle.target,
        ];
      })
    : [];

  const bombsMappedForSheets = guildBossBombs.length
    ? guildBossBombs.map((bomb) => {
        return [
          bomb.eventId,
          bomb.timestamp,
          bomb.player,
          bomb.damage,
          bomb.guildBossEncounterType,
          bomb.levelId,
          bomb.date,
          bomb.season,
          bomb.circuit,
          bomb.world,
          bomb.boss,
          bomb.target,
        ];
      })
    : [];

  return {
    guildBossData,
    guildBossBattles,
    guildBossBombs,
    battlesMappedForSheets,
    bombsMappedForSheets,
    lastEventSeq,
  };
};

module.exports.getGuildBattlesBombs = async (event: any) => {
  console.log(event);
  const { sessionId, lastGuildBossEventId, lastRecordedEvent, round } = event;

  console.log(sessionId);

  const auth = new sheets.auth.GoogleAuth({
    keyFilename: path.join(
      __dirname,
      '../../data/dragonbot-1567112394071-e02f73d3144e.json'
    ),
    // Scopes can be specified either as an array or as a single, space-delimited string.
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();

  const sheetsClient = await sheets.sheets({ version: 'v4', auth: authClient });

  const configValues = await readFile(CONFIG_BUCKET, CONFIG_FILE);

  const { currentLeaderboardSeason, circuit } =
    await getLeaderboardCurrentTierSet(sessionId, configValues);
  // console.log(guildState, circuit)

  const {
    guildBossBattles,
    guildBossBombs,
    battlesMappedForSheets,
    bombsMappedForSheets,
    lastEventSeq,
  } = await getBossData(
    sessionId,
    configValues,
    lastRecordedEvent,
    round,
    currentLeaderboardSeason,
    circuit
  );

  // console.log(guildBossBattles, guildBossBombs)
  // console.log(`BATTLES:`,battlesMappedForSheets)
  // console.log(`BOMBS:`,battlesMappedForSheets)
  try {
    if (guildBossBattles.length) {
      console.log(battlesMappedForSheets);
      try {
        console.log(
          `Calling Write to Sheet with New BATTLES: ${JSON.stringify(
            guildBossBattles,
            null,
            2
          )}`
        );

        const res = await sheetsClient.spreadsheets.values.append({
          spreadsheetId: GOOGLE_SPREADSHEET,
          valueInputOption: 'RAW',
          range: 'Auto_BattleLogDump',
          requestBody: {
            values: battlesMappedForSheets,
          },
        });
        console.log(res.data);
      } catch (err) {
        console.log('ERROR WRITING TO SHEETS');
        return console.error(err);
      }
    }

    if (guildBossBombs.length) {
      console.log(bombsMappedForSheets);
      try {
        console.log(
          `Calling Write to Sheet with New BATTLES: ${JSON.stringify(
            guildBossBombs,
            null,
            2
          )}`
        );

        const res = await sheetsClient.spreadsheets.values.append({
          spreadsheetId: GOOGLE_SPREADSHEET,
          valueInputOption: 'RAW',
          range: 'Auto_BombLogDump',
          requestBody: {
            values: bombsMappedForSheets,
          },
        });
        console.log(res.data);
      } catch (err) {
        console.log('ERROR WRITING TO SHEETS');
        return console.error(err);
      }
    }

    const msg = `Battles Wrote to Sheet: ${battlesMappedForSheets.length}\nBombs Wrote to Sheet: ${bombsMappedForSheets.length}`;

    try {
      await updateLastGuildEventsTable(circuit, lastEventSeq);
      console.log(`Last Event Seq Value = ${lastEventSeq}`);
      console.log(
        `Round Recorded: ${circuit} | Last EventRecorded Updated to: ${lastEventSeq} `
      );
    } catch (err) {
      console.error(err);
    }

    return console.log(msg);
  } catch (err) {
    console.error(err);
  }
};
