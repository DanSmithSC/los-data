import AWS from 'aws-sdk';
import { GetObjectRequest } from 'aws-sdk/clients/s3';
import { SendMessageRequest } from 'aws-sdk/clients/sqs';
import axios from 'axios';
import user from '../../data/user.json';

const { CLIENT_SECRET, DEVICE_ID, INSTALL_ID, USER_ID, CONFIG_BUCKET,CONFIG_FILE, GUILD_ID} = process.env

AWS.config.update({ region: 'us-east-1'})
const S3       = new AWS.S3()
const lambda   = new AWS.Lambda()
const sqs      = new AWS.SQS({
  apiVersion: 'latest',
  region: process.env.AWS_REGION
})

const snowprintURL = `https://api-live.thor.snowprintstudios.com/player/player2/userId/`

const readFile = async (bucket: string, key:string) => {
  const params: GetObjectRequest = {
    Bucket: bucket,
    Key: key,
  };
 
  try{
    const response = await S3.getObject(params).promise();
    // console.log(JSON.parse(response.Body.toString('utf-8')))
    return JSON.parse(response.Body.toString('utf-8'))

  } catch(err) {
    return {
      statusCode: err.statusCode || 400,
      body: err.message || JSON.stringify(err.message)
    }
  }
};

const getSession = async (userInfo: any) => {

  try{
    const response = await axios.post(`${snowprintURL}${USER_ID}`, userInfo, {
      headers : {
        'Host':'api-live.thor.snowprintstudios.com',
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

const getGuildInfo = async (sessionId: string, configValues: any) => {
  const getViewGuildData = JSON.stringify({
    "builtInMultiConfigVersion": configValues.builtInMultiConfigVersion,
    "installId": INSTALL_ID,
    "playerEvent": {
        "createdOn": `${Date.now()}`,
        "gameConfigVersion": configValues.gameConfigVersion,
        "multiConfigVersion": configValues.multiConfigVersion,
        "playerEventData": {
            "guildId": GUILD_ID
        },
        "playerEventType": "VIEW_GUILD_2",
        "universeVersion": "52AB1265BA18205FFD9D57B2274317D8"
    }
  })

  try {
    const response = await axios.post(`${snowprintURL}${USER_ID}/sessionId/${sessionId}`, getViewGuildData, {
      headers : {
        'Host':'api-live.thor.snowprintstudios.com',
        'Content-Type':'application/json',
        'User-Agent':'solgard/984 CFNetwork/1329 Darwin/21.3.0',
        'Connection':'keep-alive',
        'Accept':'*/*',
        'Accept-Language':'en-US,en;q=0.9',
        'Content-Length': getViewGuildData.length,
        // 'Accept-Encoding':'gzip',
        'X-Unity-Version':'2019.2.21f1'
      }
    })
    
    const guildMembers = response.data.eventResult.eventResponseData.guild.members
    
    return guildMembers

  } catch (error) {
    console.error(error)
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
    // return true;
  } catch(err) {
    console.error(err)
  }
}


module.exports.getGuildMembers = async () => {

  const [ configValues ] = await Promise.all(
    [
      readFile(CONFIG_BUCKET!, CONFIG_FILE!),
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
  
  const guildMembers = await getGuildInfo(sessionId, configValues)

  const playerIds: string[] = guildMembers.map( (player: any) => {
    return player.userId
  });
  
  
  console.log(playerIds)

  for ( let playerId of playerIds ) {
    
    const params: SendMessageRequest = {
      QueueUrl: process.env.QUEUE_URL,
      MessageBody: JSON.stringify({
        sessionId: sessionId,
        playerId: playerId
      })
    }

    try{
      const data = await sqs.sendMessage( params ).promise()
      console.log(data)   
    } catch (error) {
      console.log(error)
      throw error
    }
  }
  
};