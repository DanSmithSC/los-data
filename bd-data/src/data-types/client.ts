import DynamoDB from "aws-sdk/clients/dynamodb"

let client = null

export const getClient = (): DynamoDB.DocumentClient => {
    if (client) return client
    
    client = new DynamoDB.DocumentClient({
      service:
        typeof process.env.AWS_ACCESS_KEY_ID === 'undefined'
          ? new DynamoDB({
              accessKeyId: 'fake-key',
              endpoint: 'http://localhost:8000',
              region: 'local',
              secretAccessKey: 'fake-secret',
            })
          : new DynamoDB({
            httpOptions: {
              connectTimeout: 1000,
              timeout: 1000
          }
          }),
      }
    )

    return client
}