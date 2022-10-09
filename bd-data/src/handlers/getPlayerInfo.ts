import AWS from 'aws-sdk';
import { GetObjectRequest, GetObjectOutput } from 'aws-sdk/clients/s3';
import axios from 'axios';
import { Player, updatePlayer} from "../data-types/player"
import { Unit, updateUnit } from '../data-types/unit';

AWS.config.update({ region: 'us-east-1'})
const S3       = new AWS.S3()
const lambda   = new AWS.Lambda()

const { USER_ID, INSTALL_ID, CONFIG_BUCKET, CONFIG_FILE, UNITS_FILE } = process.env

const snowprintURL = `https://api-live.thor.snowprintstudios.com/player/player2/userId/`

const readFile = async (bucket: string, key:string) => {
  const params: GetObjectRequest = {
    Bucket: bucket,
    Key: key,
  };
 
  try{
    const response: GetObjectOutput = await S3.getObject(params).promise();
    // console.log(JSON.parse(response.Body.toString('utf-8')))
    return JSON.parse(response.Body.toString('utf-8'))

  } catch(error) {
    return {
      statusCode: error.statusCode || 400,
      body: error.message || JSON.stringify(error.message)
    }
  }
};

const requestPlayerInfo = async (sessionId:string, configValues:any, playerId: string )=> {
  const getPlayerInfo = JSON.stringify({
    "builtInMultiConfigVersion": configValues.builtInMultiConfigVersion,
    "installId": INSTALL_ID,
    "playerEvent": {
        "createdOn": `${Date.now()}`,
        "gameConfigVersion": configValues.gameConfigVersion,
        "multiConfigVersion": configValues.multiConfigVersion,
        "playerEventData": {
          "requestedUserId": playerId
        },
        "playerEventType": "GET_PLAYER_INFO",
        "universeVersion": "52AB1265BA18205FFD9D57B2274317D8"
    }
  })

  try {
    const response = await axios.post(`${snowprintURL}${USER_ID}/sessionId/${sessionId}`, getPlayerInfo, {
      headers : {
        'Host':'api-live.snowprintstudios.com',
        'Content-Type':'application/json',
        'User-Agent':'solgard/984 CFNetwork/1329 Darwin/21.3.0',
        'Connection':'keep-alive',
        'Accept':'*/*',
        'Accept-Language':'en-US,en;q=0.9',
        'Content-Length': getPlayerInfo.length,
        // 'Accept-Encoding':'gzip',
        'X-Unity-Version':'2019.2.21f1'
      }
    })

    const player = response.data.eventResult.eventResponseData.heroInfo
    return player;

  } catch(error) {
    console.log( error )
    throw error
  }
}

module.exports.getPlayerInfo = async (event:any) => {

  for (const message of event.Records){
    console.log(JSON.parse(message.body))
    // const bodyData = JSON.parse(message.body)
    const { sessionId, playerId } = JSON.parse(message.body);

    console.log(sessionId, playerId)
    const configValues = await readFile(CONFIG_BUCKET!, CONFIG_FILE!)
    const units = await readFile(CONFIG_BUCKET!, UNITS_FILE!)
    
    const player = await requestPlayerInfo(sessionId, configValues, playerId)
    const playerUnits = player.units.units;

    const currentPlayer = new Player(
      playerId,
      "Player",
      player.displayName,
      player.level,
      player.equipment.totalEquipmentLevel
    )

    // console.log(currentPlayer)
    
    await updatePlayer(currentPlayer)

    for(let unit of playerUnits)  {
      
      let _unitId = Buffer.from(unit.unitId, 'utf-8').toString()
      const currentUnit = new Unit(
        playerId,
        _unitId,
        "Unit",
        units[_unitId].name,
        units[_unitId].rarity,
        units[_unitId].role,
        units[_unitId].race,
        unit.rank,
        unit.filledRuneSlots ? unit.filledRuneSlots : [],
        unit.attackLevel ? unit.attackLevel : 0,
        unit.spellLevel ? unit.spellLevel : 0,
        !unit.statues 
          ? undefined
          : unit.statues.Left 
            ? unit.statues.Left 
            : "",
        !unit.statues 
          ? undefined
          : unit.statues.Right 
            ? unit.statues.Right
            : "", 
      )
      
      await updateUnit(currentUnit)
    }
  }

};