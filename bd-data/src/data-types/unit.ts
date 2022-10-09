import { DynamoDB } from "aws-sdk"
import { Item } from "./base"
import { getClient } from "./client"

export class Unit extends Item {
  playerId: string
  unitId: string
  type: string
  unitName: string
  rarity: string
  role: string
  race: string
  rank: number
  filledRuneSlots: number[]
  attackLevel: number
  spellLevel: number
  sunIdol: string
  moonIdol: string
  lastUpdated: string
  

  constructor(
    playerId: string, 
    unitId: string, 
    type: string, 
    unitName: string,
    rarity: string,
    role: string,
    race: string, 
    rank?: number, 
    filledRuneSlots?: number[], 
    attackLevel?: number, 
    spellLevel?: number,
    sunIdol?: string,
    moonIdol?: string,
    lastUpdated?: string
    

    ) {
    super()
    this.playerId = playerId
    this.unitId = unitId
    this.type = type
    this.unitName = unitName || ""
    this.rarity = rarity || ""
    this.role = role || ""
    this.race = race || ""
    this.rank = rank || 0
    this.filledRuneSlots = filledRuneSlots || []
    this.attackLevel = attackLevel || 0
    this.spellLevel = spellLevel || 0
    this.sunIdol = sunIdol || "No Idol"
    this.moonIdol = moonIdol || "No Idol"
    this.lastUpdated = lastUpdated || ""
    

  }

  static fromItem(item: DynamoDB.AttributeMap): Unit {
    if(!item) throw new Error('No Item!')
    return new Unit(
      item.playerId.S,
      item.unitId.S, 
      item.type.S, 
      item.unitName.S,
      item.rarity.S,
      item.role.S,
      item.race.S, 
      Number(item.rank.N), 
      item.filledRuneSlots.NS, 
      Number(item.attackLevel.N), 
      Number(item.spellLevel.N), 
      item.sunIdol.S, 
      item.moonIdol.S,
      item.lastUpdated.S 
      
    )
  }

  get pk(): string {
    return `PLAYER#${this.playerId}`
  }

  get sk(): string {
    return `UNIT#${this.unitId}`
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
      UnitId: this.unitId,
      Type: this.type,
      UnitName: this.unitName,
      Rank: this.rank.toString(),
      FilledRuneSlots: this.filledRuneSlots,
      AttackLevel: this.attackLevel.toString(),
      SpellLevel: this.spellLevel.toString(),
      SunIdol: this.sunIdol,
      MoonIdol: this.moonIdol,
      Rarity: this.rarity,
      Role: this.role,
      Race: this.race,
      LastUpdated: this.lastUpdated
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

export const updateUnit = async ( unit: Unit ): Promise<Unit> => {
  const client = getClient()
  try {
    const response = await client
      .update({
        TableName: process.env.TABLE_NAME,
        Key: unit.keys(),
        UpdateExpression: "SET \
          #uid = :uid, \
          #t = :t, \
          #un = :un, \
          #r = :r, \
          #frs = :frs, \
          #al = :al, \
          #sl = :sl, \
          #si = :si, \
          #mi = :mi, \
          #rar= :rar,\
          #role = :role,\
          #race = :race, \
          #lastUpdated = :lastUpdated\
        ",
        ExpressionAttributeNames: {
          "#uid": "UnitId",
          "#t": "Type",
          "#un": "UnitName",
          "#r": "Rank",
          "#frs": "FilledRuneSlots",
          "#al": "AttackLevel", 
          "#sl": "SpellLevel", 
          "#si": "SunIdol", 
          "#mi": "MoonIdol", 
          "#rar": "Rarity",
          "#role": "Role",
          "#race": "Race",
          "#lastUpdated": "LastUpdated" 
        },
        ExpressionAttributeValues: {
          ":uid": unit.unitId,
          ":t" : unit.type,
          ":un": unit.unitName,
          ":r": unit.rank,
          ":frs": unit.filledRuneSlots,
          ":al": unit.attackLevel,
          ":sl": unit.spellLevel,
          ":si": unit.sunIdol,
          ":mi": unit.moonIdol,
          ":rar": unit.rarity,
          ":role": unit.role,
          ":race": unit.race,
          ":lastUpdated": unit.lastUpdated
        } 
      })
      .promise()
      return unit
  } catch (error) {
    console.log( error )
    throw error 
  }

}