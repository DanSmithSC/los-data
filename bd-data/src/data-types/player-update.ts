import { ulid } from "ulid"

import { Item } from "./base"
import { getClient } from "./client"
import { Player } from './player'

export class PlayerUpdate extends Item {
  playerId: string
  updatedData: Map<string, string>
  updatedAt: string
  
  constructor(
    playerId: string,  
    updatedData: Map<string, string>,
    updatedAt: string,
    ) {
    super()
    this.playerId = playerId
    this.updatedData = updatedData
    this.updatedAt = updatedAt
  }

  // static fromItem(item: DynamoDB.AttributeMap): UpdateEvent {
  //   if(!item) throw new Error('No Item!')
  //   return new UpdateEvent(
  //     item.playerId.S,
  //     item.type.S, 
  //     item.unitId.S, 
  //     item.unitName.S,
  //   )
  // }

  get pk(): string {
    return `UPDATE#${this.playerId}`
  }

  get sk(): string {
    return `UPDATE#${ulid()}`
  }

  get gsi1pk(): string {
    return `PLAYER#${this.playerId}`
  }

  get gsi1sk(): string {
    return `PLAYER#${this.playerId}`
  }

  toItem(): Record<string, unknown> {
    return {
      ...this.keys(),
      GSI1PK: { S: this.gsi1pk },
      GSI1SK: { S: this.gsi1sk },
      updatedData: { M: this.updatedData },
      updatedAt: { S: this.updatedAt },
    }
  }
}

// export const getUnit = async (unitId: string): Promise<Unit> => {
//   const client = getClient()
//   const unit = new Unit( unitId, "" )

//   try {
//     const response = await client
//       .getItem({
//         TableName: process.env.TABLE_NAME,
//         Key: unit.keys()
//       })
//       .promise()
//       return Unit.fromItem(response.Item)
//   } catch( error ) {
//     console.log( error )
//     throw error
//   }
// } 

export const updatePlayerEvent = async ( playerUpdate: PlayerUpdate ): Promise<PlayerUpdate> => {
  const client = getClient()
  try {
    const response = await client
      .update({
        TableName: process.env.TABLE_NAME,
        Key: playerUpdate.keys(),
        UpdateExpression: "SET \
            #pid = :pid, \
            #udata = :udata, \
            #uat = :uat \
          ",
        ExpressionAttributeNames:{
          "#pid": "PlayerId",
          "#udata": "UpdatedData",
          "#uat": "UpdatedAt"
        },
        ExpressionAttributeValues: {
          ":pid": playerUpdate.playerId,
          ":udata": playerUpdate.updatedData,
          ":uat": playerUpdate.updatedAt
        }  
      })
      .promise()
      return playerUpdate
    } catch (error) {
        console.log(error)
        throw error
    }

}