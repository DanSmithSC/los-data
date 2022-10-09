import { ulid } from "ulid"

import { Item } from "./base"
import { getClient } from "./client"
// import { Unit } from './unit'
// import { executeTransactWrite } from "./utils"

export class UnitUpdate extends Item {
  playerId: string
  unitId: string
  updatedData: Map<string, string>
  updatedAt: string
  
  constructor(
    playerId: string,
    unitId: string,  
    updatedData: Map<string, string>,
    updatedAt: string,
    ) {
    super()
    this.playerId = playerId
    this.unitId = unitId
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
    return `UNIT#${this.unitId}#UPDATE#${ulid()}`
  }

  get gsi1pk(): string {
    return `PLAYER#${this.playerId}#UNIT#${this.unitId}`
  }

  get gsi1sk(): string {
    return `UNIT#${this.unitId}`
  }

  toItem(): Record<string, unknown> {
    return {
      ...this.keys(),
      GSI1PK: { S: this.gsi1pk },
      GSI1SK: { S: this.gsi1sk },
      playerId: {S: this.playerId},
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

export const updateUnitEvent = async ( unitUpdate: UnitUpdate ): Promise<UnitUpdate> => {
  const client = getClient()
  try {
    const response = await client
      .update({
        TableName: process.env.TABLE_NAME,
        Key: unitUpdate.keys(),
        UpdateExpression: "SET \
            #pid = :pid,\
            #uid = :uid, \
            #udata = :udata, \
            #uat = :uat \
          ",
        ExpressionAttributeNames:{
          "#pid": "PlayerId",
          "#uid": "UnitId",
          "#udata": "UpdatedData",
          "#uat": "UpdatedAt"
        },
        ExpressionAttributeValues: {
          ":pid": unitUpdate.playerId,
          ":uid": unitUpdate.unitId,
          ":udata": unitUpdate.updatedData,
          ":uat": unitUpdate.updatedAt
        }  
      })
      .promise()
      return unitUpdate
    } catch (error) {
        console.log(error)
        throw error
    }

}