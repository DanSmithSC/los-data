import AWS from 'aws-sdk';
import axios from 'axios';
import user from './data/user.json';

AWS.config.update({ region: 'us-east-1'})
const dynamodb = new AWS.DynamoDB.DocumentClient()
const S3       = new AWS.S3()
const lambda   = new AWS.Lambda()

//TODO: Add User-Agent to environment Variables.
const { TABLE_NAME, CLIENT_SECRET, DEVICE_ID, INSTALL_ID, USER_ID, CONFIG_BUCKET,CONFIG_FILE} = process.env

const snowprintURL = `https://api-live.thor.snowprintstudios.com/player/player2/userId/`

// console.log(TABLE_NAME, GUILD_TAG, CLIENT_SECRET, DEVICE_ID, INSTALL_ID, USER_ID)

const readFile = async (bucket: String, key:String) => {
  const params = {
    Bucket: bucket,
    Key: key,
  };
 
  try{
    const response = await S3.getObject(params).promise();
    // console.log(JSON.parse(response.Body.toString('utf-8')))
    return JSON.parse(response.Body.toString('utf-8'))

  } catch(err) {
    console.error(err)
    return {
      statusCode: err.statusCode || 400,
      body: err.message || JSON.stringify(err.message)
    }
  }
};

const getSession = async (userInfo) => {

  try{
    const response = await axios.post(`${snowprintURL}${USER_ID}`, userInfo, {
      headers : {
        'Host':'api-live.snowprintstudios.com',
        'Content-Type':'application/json',
        'User-Agent':'solgard/984 CFNetwork/1329 Darwin/21.3.0',
        'Connection':'keep-alive',
        'Accept':'*/*',
        'Accept-Language':'en-US,en;q=0.9',
        'Content-Length': JSON.stringify(userInfo).length,
        // 'Accept-Encoding':'gzip',
        'X-Unity-Version':'2019.2.21f1'
      }
    })
    
    const sessionId = response.data.eventResult.eventResponseData.userData.sessionId;
    return sessionId;
  } catch(err){
    console.error(err)
  }
  
}

const getDungeonSeasonData = async (sessionId, configValues) => {
  
  const getPlayer2Data = JSON.stringify({
    "builtInMultiConfigVersion": configValues.builtInMultiConfigVersion,
    "installId": INSTALL_ID,
    "playerEvent": {
        "createdOn": `${Date.now()}`,
        "gameConfigVersion": configValues.gameConfigVersion,
        "multiConfigVersion": configValues.multiConfigVersion,
        "playerEventData": {},
        "playerEventType": "GET_PLAYER_2",
        "universeVersion": "52AB1265BA18205FFD9D57B2274317D8"
    }
  })
  
  try {
    const response = await axios.post(`${snowprintURL}${USER_ID}/sessionId/${sessionId}`, getPlayer2Data, {
      headers : {
        'Host':'api-live.snowprintstudios.com',
        'Content-Type':'application/json',
        'User-Agent':'solgard/984 CFNetwork/1329 Darwin/21.3.0',
        'Connection':'keep-alive',
        'Accept':'*/*',
        'Accept-Language':'en-US,en;q=0.9',
        'Content-Length': getPlayer2Data.length,
        // 'Accept-Encoding':'gzip',
        'X-Unity-Version':'2019.2.21f1'
      }
    })
    // console.log(response.data.eventResult.eventResponseData.player.guild.guildBossGameMode)

    // console.log(response.data.eventResult.eventResponseData.player.guild.guildBossGameMode.currentSet.encounters)
    // console.log(`Last Guild State Event IDs:`,response.data.eventResult.eventResponseData.player.guildEventsState)
    const guildEventsState = response.data.eventResult.eventResponseData.player.guildEventsState
    
    // console.log(response.data.eventResult.eventResponseData.player.guild.guildBossGameMode.season.season+1)
    const season = response.data.eventResult.eventResponseData.player.guild.guildBossGameMode.season.season+1
    // console.log(response.data.eventResult.eventResponseData.player.guild.guildBossGameMode.tiers[14])
    return {guildEventsState, season}

  } catch (error) {
    console.error(error)
  }
    
}

// This function calls DynamoDB to get the last Recorded Values for the GuildBoss Dungeon Events
const getLastRecordedState = async () => {
  // TODO: DO BATCH GET IF WE WANT BOOSTS TOO.
  try {
    let data = await dynamodb.batchGet({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: [
            {
              guildEventMode: 'lastGuildBossEventId',
            },
            {
              guildEventMode: 'lastRecordedDungeonRound',
            }
          ],
          ProjectionExpression: "eventId, round"  
        }
      }
    }).promise()
    
    if(data){
      const round = data.Responses[TABLE_NAME].find( item => item.round).round
      const eventId = data.Responses[TABLE_NAME].find( item => item.eventId).eventId
      return {round, eventId}
    } 
    
  } catch(err) {
    console.error(err)
  } 
}

const invokeLambda = async (data, fnName) => {
  let params = {
    FunctionName: fnName,
    InvocationType: 'Event',
    Payload: JSON.stringify(data),
    LogType: "Tail"
  }

  try{
    await lambda.invoke(params).promise();
    return true;
  } catch(err) {
    console.error(err)
  }
}


module.exports.getGuildState = async (event:any) => {

  const [ configValues, lastRecordedEvents ] = await Promise.all(
    [
      readFile(CONFIG_BUCKET, CONFIG_FILE),
      getLastRecordedState(),
    ]
  )
  
  const userInfo = {
    ...user,
    builtInMultiConfigVersion: configValues.builtInMultiConfigVersion,
    installId: INSTALL_ID,
    playerEvent:{
      ...user.playerEvent,
      createdOn: Date.now(),
      gameConfigVersion: configValues.gameConfigVersion,
      multiConfigVersion: configValues.multiConfigVersion,
      playerEventData: {
        ...user.playerEvent.playerEventData,
        clientSecret: CLIENT_SECRET,
        deviceData:{
          ...user.playerEvent.playerEventData.deviceData,
          buildString: configValues.buildString,
          deviceId: DEVICE_ID,
          installId: INSTALL_ID
        },
        userId: USER_ID
      }
    } 
  }
    
  const sessionId = await getSession(userInfo).then( value => {return value})
  console.log(`SessionId | ${sessionId}`)

  const {guildEventsState, season} = await getDungeonSeasonData(sessionId, configValues)
  
  if( lastRecordedEvents.eventId < guildEventsState.lastGuildBossEventId ){
    const payload = {
      sessionId,
      lastGuildBossEventId: guildEventsState.lastGuildBossEventId,
      lastRecordedEvent: lastRecordedEvents.eventId,
      season,
      round: lastRecordedEvents?.round
    }
    
    await invokeLambda(payload, 'nw-data-dev-getGuildBattlesBombs')
    return {
      message: "Calling Next Function: nw-data-dev-getGuildBattlesBombs",
      payload: payload
    }
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: 'Guild Events Checked - No New Events to Pull',
        input: event,
      },
      null,
      2
    ),
  };
};