# Aigent Transcription API
a public library to be used while implementing the integration with the Aigent transcription API
The Aigent api is available at: wss://transcription.aigent.ai/connector

## How to run the full example
clone the repository to your local.

`https://github.com/Aigent/transcription-api-library`

## Requirements and environment
An Aigent Keycloak account that can be requested at help@aigent.ai

you can see the required envinroment variables in .env.template

you will receive: 
```
export KEYCLOAK_SERVICE_USERNAME="user"
export KEYCLOAK_SERVICE_PASSWORD="password"
```
from help@aigent.ai

This is the url that creates the tokens needed to authenticate.
```
export KEYCLOAK_TOKEN_ENDPOINT="https://auth.aigent.ai/auth/realms/dashboard/protocol/openid-connect/token"
```
A library on how to do that is provided at:

`https://github.com/Aigent/transcription-api-library/blob/main/AigentConnector.js`

This is the url of the transcription service:
```
export AIGENT_API_URL="wss://transcription.aigent.ai/connector"
```

## Library
We provide a library that can be used to integrate 

The library can be found: https://github.com/Aigent/transcription-api-library/blob/main/AigentConnector.js 

An example implementation can be found here: 

https://github.com/Aigent/transcription-api-library/blob/main/app.js  

The connection is done using websockets.

We establish the connection using the uri provided, with the token as an url argument

```
    this.socket = new WebSocket(uri);
```
2 Streams are required in order to transcribe a recording:

1 stream for the agent channel

1 stream for the client channel

## Data Format
The data is expected to be in the following format:

an Uint8 array with the following data: [ code, code, timestamp, timestamp, timestamp, timestamp,  payload…]

```
/**
  * @tag AigentConnector
 * @summary prepare the given payload for send
 * @description Uses internally by send method
 * @param {code} integer. Message type id
 * @param {payload} Uint8Array. Data being sent
 * @response Uint8Array encoded message
 */
 const timestampArrayLength = 4;
function encode(code, payload) {
    const binCode = new Uint8Array([code & 0x00ff, (code & 0xff00) >> 8]);
    const binMsg = new Uint8Array(binCode.byteLength + timestampArrayLength + payload.byteLength);
    const timestampArray = generateTimestampArray();
    binMsg.set(binCode, 0);
    binMsg.set(timestampArray, binCode.byteLength);
    binMsg.set(payload, binCode.byteLength + timestampArrayLength);
    return binMsg;
}
```
## Timestamp Generation
The timestamp is a unix timestamp, a uint32 integer that we expect as the bytes immediately following the 2 code bytes.

The timestamp can be generated using the following function:

```
const timestampArrayLength = 4;
function generateTimestampArray() {
    let timestamp = Math.round(new Date().getTime() / 1000); // get unix timestamp in seconds
    let timestampArray = new Uint8Array(timestampArrayLength);
    for (var index = 0; index < timestampArray.length; index++) {
        var byte = timestamp & 0xff;
        timestampArray[index] = byte;
        timestamp = (timestamp - byte) / 256;
    }
    return timestampArray;
}
```

## How to generate a recordingId
We provide the following function in order to generate an unique recordingId, this is to be used if connection comes from a browser.

```
/**
* @tag AigentConnector
* @summary generate unique recording identifier.
* @description generate uuidv4 using xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx schema
* @param {code} integer. Message type id
* @param {payload} Uint8Array. Data being sent
* @response uuid string value
*/
function generateRecordingId() {
   return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
       const r = (Math.random() * 16) | 0;
       const v = c == "x" ? r : (r & 0x3) | 0x8;
       return v.toString(16);
   });
}
```
Alternatively you can use the uuid library: `npm: uuid` 

Codes:

```
/**
 *
 * @tag AigentConnector
 * @summary metadata message type
 * @description defines a metadata message type of send method
 */
const codeMetadata = 1;

/**
 * @tag AigentConnector
 * @summary voice message type
 * @description defines a voice message type of send method
 */
const codeVoice = 2;

/**
 * @tag AigentConnector
 * @summary flush message type
 * @description defines a message to be sent at the end of the call to flush the buffer and receive the best results
 */
const codeFlush = 3;
```
## Code Metadata

The content of the metadata will look like this:

```
  const unique-recording-id =  generateRecordingId(),

  Example of Agent Data:

  {
      voice: {
          'channel': 'agent', // client|agent (mandatory field)
          'recordingId': 'unique-recording-id' // (mandatory field, must be unique per a recording)
          'codec': 's16le', // (mandatory field s16le is a specific wav format used by our transcription engine.)
          'samplingRate': 8000, // (mandatory field)
          'direction': 'inbound', // inbound|outbound (inbound is default)
      },
      'agentId': '100900', // (optional field)
      'category': 'catogory-of-program', // VDN (optional field)
      'ani': 'client-phone-number', // (optional field)
      'agentAni': 'agent-phone-number', // (optional field)
      'programId': 'program-id', // (optional field)
  }
```
 Example of Client Data: 

```
{
     voice: {
         'channel': 'client', // client|agent (mandatory field)
          'recordingId': 'unique-recording-id' // (mandatory field, must be unique per a recording)
          'codec': 's16le', // (mandatory field s16le is a specific wav format used by our transcription engine.)
          'samplingRate': 8000, // (mandatory field)
          'direction': 'inbound', // inbound|outbound (inbound is default)
      },
      'agentId': '100900', // (optional field)
      'category': 'catogory-of-program', // VDN (optional field)
      'ani': 'client-phone-number', // (optional field)
      'agentAni': 'agent-phone-number', // (optional field)
      'programId': 'program-id', // (optional field)
 }
 ```
The metadata is encoded with the codeMetadata variable and sent through the websocket
```
encode(codeMetadata, metadataObj)
```
## Code Audio
The audio is encoded besides the codeVoice
```
encode(codeVoice, audioData)
```

## Code Flush

when you are done sending audio, to flush the buffers of kaldi server you should send a code flush.

```
sendFlush() {
    const payload = new Uint8Array(1);
    console.log("Connector: send flush");
    if (!this.isConnected() || (this.buffer && this.buffer.length > 0)) {
        /** buffer voice until previous voice data is transmitted via socket */
        this.buffer && this.buffer.push({ code: codeFlush, payload: payload });
    } else {
        this.sendCode(codeVoice, payload);
    }
}
```

This will also handle the initiation of the closing sequence of the websocket after the flush message is sent.


## Response
As a response we will send incremental transcriptions. Meaning that while the audio is sent responses with more and more of the call will be received. e.g.
response 1:

```
{
    transcription: "hello "
}
```
response 2:

```
{
    transcription: "Hello, this is your customer"
}
 ```

The transcription returned will be unmasked.

