import { DynamoDBStreamEvent } from "aws-lambda";
import { DynamoDBRecord } from "aws-lambda";
import { AttributeValue } from "aws-sdk/clients/dynamodb";

import { unmarshall } from '@aws-sdk/util-dynamodb'

import { ObjectUtils } from "../data-types/object-utils";
import { Unit } from "../data-types/unit";
import { Player } from '../data-types/player'
import { PlayerUpdate, updatePlayerEvent} from "../data-types/player-update";
import { UnitUpdate, updateUnitEvent } from "../data-types/unit-update";


// Import UpdateEvent Data Type and "Create Event"

// Process the Event and Deteremine how to store an update event into the DB
const parseRecord = (record: DynamoDBRecord) => {
  console.log(record)
  if (!record.dynamodb?.NewImage) {
    throw new Error("Invalid DynamoDBRecord")
  }

  // parse the weird object shape
  const newItem = unmarshall(
    record.dynamodb?.NewImage as {
      [key: string]: AttributeValue
    }
  )
  
  const oldItem = record.dynamodb.OldImage
  ? unmarshall(
    record.dynamodb?.OldImage as {
      [key: string]: AttributeValue
    }
  )
  : {}
  
  console.log(`OLD ITEM:`) 
  console.log(oldItem)
  console.log(`NEW ITEM:`)
  console.log(newItem)
  
  if(record.eventName === 'INSERT'){
    return newItem
  }

  const diffedItem = itemDifference(oldItem, newItem)
  console.log(`DIFFED ITEM`)
  console.log(diffedItem)
  console.log(`DIFFED ITEM STRINGIFY`)
  console.log(JSON.stringify(diffedItem))
  
  return diffedItem
}

const itemDifference = (oldItem:any, newItem:any) => {
  return ObjectUtils.diff(oldItem, newItem)
}

// Compare the Values to come up with the "Change" to display a type of event. 
// - (Player#<attribute>, Unit#<Attribute>)
// - New Value listed
// - Use ulid to track the datetime
// - setup Index on them so they can be sorted by "Attribute Update Type?"


module.exports.processStreamUpdate = async (event:DynamoDBStreamEvent) => {
  console.log(event.Records)

  for (const record of event.Records) {
    console.log(JSON.stringify(record))
    // Process the Event Type - Insert, Modify, etc.
    // Prior to using stream filterPatterns in serverless.yaml it was compared below
    // if( record.eventName === 'REMOVE') {return} 
    if( record.eventName === 'INSERT' ) {
      const parsedNewRecord = parseRecord(record) 

      const unitUnlocked = { "unlockedUnit" : parsedNewRecord.UnitName }
      const unlockedAt = record.dynamodb?.ApproximateCreationDateTime 
        ? new Date(record.dynamodb?.ApproximateCreationDateTime * 1000).toISOString()
        : new Date().toISOString()
      const unitUpdate = new UnitUpdate(parsedNewRecord.PK.slice(7), parsedNewRecord.UnitId, unitUnlocked, unlockedAt)

      try {
        const response = await updateUnitEvent(unitUpdate)
        console.log(response)
      } catch(error) {
        console.log( error )
        throw error;
      }
    }

    const parsedUpdateEvent = parseRecord(record)
    // Check for Changes / Compare Item
    console.log(`Logging Parsed Updated Event`)
    console.log(parsedUpdateEvent)
    // Write to Table the "Update Type... Player/Unit"
    
    const updatedAt = record.dynamodb?.ApproximateCreationDateTime 
      ? new Date(record.dynamodb?.ApproximateCreationDateTime * 1000).toISOString()
      : new Date().toISOString()

    // const playerUpdate = new PlayerUpdate (parsedUpdateEvent.unchanged.PlayerId, parsedUpdateEvent.updated, updatedAt )

    if((parsedUpdateEvent.updated || parsedUpdateEvent.added) && parsedUpdateEvent.unchanged.Type === 'Player' ) {
    
      const playerUpdate = new PlayerUpdate (parsedUpdateEvent.unchanged.PlayerId, parsedUpdateEvent.updated, updatedAt )
      // const player = new Player(parsedUpdateEvent.unchanged.PlayerId)
      try{
        const response = await updatePlayerEvent(playerUpdate)
        console.log(response)
      } catch(error) {
        console.log( error )
        throw error;
      }
    }
    
    if((parsedUpdateEvent.updated || parsedUpdateEvent.added) && parsedUpdateEvent.unchanged.Type === 'Unit') {
      const newRuneSlotsValue = parsedUpdateEvent.updated.FilledRuneSlots.newValue
      const oldRuneSlotsValue = parsedUpdateEvent.updated.FilledRuneSlots.oldValue
      
      const diffedItemRunesCompared = parsedUpdateEvent
      if(newRuneSlotsValue.length === oldRuneSlotsValue.length) {
        diffedItemRunesCompared.unchanged.FilledRuneSlots = diffedItemRunesCompared.updated.FilledRuneSlots.oldValue
        delete diffedItemRunesCompared.updated.FilledRuneSlots
      }
      
        console.log(diffedItemRunesCompared)
      
      const unitUpdate = new UnitUpdate(diffedItemRunesCompared.unchanged.PK.slice(7), diffedItemRunesCompared.unchanged.UnitId, diffedItemRunesCompared.updated, updatedAt)
      
      try{
        const response = await updateUnitEvent(unitUpdate)
        console.log(response)
      } catch(error) {
        console.log( error )
        throw error;
      }
    }

  }
}