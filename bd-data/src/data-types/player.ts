import { DynamoDB } from "aws-sdk"
import { Item } from "./base"
import { getClient } from "./client"

export class Player extends Item {
  playerId: string
  type: string
  playerName: string
  playerLevel: number
  equipmentLevel: number

  constructor( playerId: string, type?: string, playerName?: string, playerLevel?: number, equipmentLevel?: number) {
    super()
    this.playerId = playerId
    this.type = type || ""
    this.playerName = playerName || ""
    this.playerLevel = playerLevel || 0
    this.equipmentLevel = equipmentLevel || 0
  }

  static fromItem(item: DynamoDB.AttributeMap): Player {
    if(!item) throw new Error('No Item!')
    return new Player(item.playerId.S, item.type.S, item.playerName.S, Number(item.playerLevel.N), Number(item.equipmentLevel.N))
  }

  get pk(): string {
    return `PLAYER#${this.playerId}`
  }

  get sk(): string {
    return `PLAYER#${this.playerId}`
  }

  get gsi1pk(): string {
    return `PLAYER#${this.playerId}#PLAYER#${this.playerId}`
  }

  get gsi1sk(): string {
    return `PLAYER#${this.playerId}`
  }

  toItem(): Record<string, unknown> {
    return {
      ...this.keys(),
      GSI1PK: { S: this.gsi1pk },
      GSI1SK: { S: this.gsi1sk },
      PlayerId: this.playerId,
      Type: this.type,
      PlayerName: this.playerName,
      PlayerLevel: this.playerLevel.toString(),
      EquipmentLevel: this.equipmentLevel.toString(),
      }
    }
  }
}

// export const createUser = async ( player: Player): Promise<Player> => {
//   const client = getClient()

//   try{
//     await client
//       .putItem( {
//         TableName: process.env.TABLE_NAME,
//         Item: user.toItem(),
//         ConditionExpression: "attribute_not_exits(PK)"
//       } )
//       .promise()
//       return player
//   } catch( error ) {
//     console.log( error )
//     throw error
//   }
// }

// export const getUser = async (username: string): Promise<Player> => {
//   const client = getClient()
//   const user = new Player( username, "" )

//   try {
//     const response = await client
//       .getItem({
//         TableName: process.env.TABLE_NAME,
//         Key: user.keys()
//       })
//       .promise()
//       return User.fromItem(response.Item)
//   } catch( error ) {
//     console.log( error )
//     throw error
//   }
// } 

export const updatePlayer = async ( player: Player ): Promise<Player> => {
  const client = getClient()
  try {
    const response = await client
      .update({
        TableName: process.env.TABLE_NAME,
        Key: player.keys(),
        UpdateExpression: "SET \
          #pid = :pid, \
          #t = :t, \
          #pn = :pn, \
          #pl = :pl, \
          #el = :el \
        ",
        ExpressionAttributeNames: {
          "#pid": "PlayerId",
          "#t" : "Type",
          "#pn": "PlayerName",
          "#pl": "PlayerLevel",
          "#el": "EquipmentLevel",
        },
        ExpressionAttributeValues: {
          ":pid": player.playerId,
          ":t" : player.type,
          ":pn": player.playerName,
          ":pl": player.playerLevel,
          ":el": player.equipmentLevel,
        } 
      })
      .promise()
      return player
  } catch (error) {
    console.log( error )
    throw error 
  }

}