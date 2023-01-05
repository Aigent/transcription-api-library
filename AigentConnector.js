import WebSocket from "ws";
import fs from "fs";
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

/**
  * @tag AigentConnector
  * @summary a class to connect a browser with Aigent.com
  * @description send audio stream to Aigent cluster via websocket.
  Make sure your browser is up-to-date and supports both: MediaStream and
  Websocket.
  * @param {url} Aigent cluster address (e.g. http://example.com:8080)
  * @param {metadata} media stream metadata. Map object type.
  Example:
  {
      voice: {
          'channel': 'client', // client|agent (mandatory field)
          'clientCallId': generateCallId(), // (mandatory field, must be unique per a call) generated uuid
          'codec': 'libopus', // (mandatory field)
          'samplingRate': 48000, // (mandatory field)
          'direction': 'inbound', // inbound|outbound (inbound is default)
      },
      'agentId': '100900', // (mandatory field)
      'category': 'catogory-of-program', // VDN (optional field, this allows the addition of filters to triggers)
      'agentWindowsUsername': 'corp//alex' // the osUsername of the client
      'ani': 'client-phone-number', // (optional field, but some features will not be available)
      'agentAni': 'agent-phone-number', // (optional field)
      'programId': 'program-id', // (optional field)
  }
  * @param {username} username
  * @param {password} password
  * @param {verbose} optional. If true print information to console.log()
  Default is false
 */
export class AigentConnector {
    constructor(url, metadata, username, password, verbose = false) {
        this.url = url;
        this.metadata = metadata;
        this.verbose = verbose;
        this.username = username;
        this.password = password;
        this.buffer = [];
        this.isMetaDataSent = false;
        this.dequeueBufferJob;
    }

    /**
     * @tag AigentConnector
     * @summary method
     * @description open a new audio stream and send metadata
     */
    startStream(keycloak_access_token) {
        const uri = `${this.url}?aigent-api-token=${keycloak_access_token}`;
        this.socket = new WebSocket(uri);
        this.socket.onopen = () => {
            if (this.verbose) {
                console.log("Connector: opened stream: call id:", this.metadata.voice.clientCallId);
            }
            this.isMetaDataSent = this.sendCode(codeMetadata, new TextEncoder().encode(JSON.stringify(this.metadata)));
            this.dequeueBufferTrigger();
        };
        this.socket.onmessage = msg => {
            // console.log("Connector: msg: ", msg);
            console.log("connector msg:", msg.data);
        };
        this.socket.onclose = event => {
            if (event.wasClean) {
                if (this.verbose) {
                    console.log("Connector: connection closed by peer.");
                }
                this.clean();
                return;
            }
            if (this.verbose) {
                console.log("Connector: connection closed.", event);
            }
            this.clean();
        };
        this.socket.onerror = err => {
            if (this.verbose) {
                console.log("Connector: error: ", err);
            }
        };
    }

    /**
     * @tag AigentConnector
     * @summary method
     * @description send the given media byte stream
     * @param {voice} Uint8Array voice buffer
     */
    sendVoice(voice) {
        if (!this.isConnected() || (this.buffer && this.buffer.length > 0)) {
            /** buffer voice until previous voice data is transmitted via socket */
            this.buffer && this.buffer.push({ code: codeVoice, payload: voice });
        } else {
            this.sendCode(codeVoice, voice);
        }
    }

    /**
     * @tag AigentConnector
     * @summary method
     * @description send the given data
     * @param {code} integer. Message type id
     * @param {data} Uint8Array data buffer
     * * @response true or false
     */
    sendCode(code, data) {
        if (data && this.isConnected()) {
            if (code !== codeMetadata || (code === codeMetadata && !this.isMetaDataSent)) {
                this.socket.send(encode(code, data));
                return true;
            }
        } else if (this.verbose) {
            // console.log("Connector: unable to send data via socket. Stored in buffer to send it later.", this.buffer);
            console.log("Connector: unable to send data via socket. Stored in buffer to send it later.");
        }
        return false;
    }

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
    /**
     * @tag AigentConnector
     * @summary trigger
     * @description dequeue buffer to transmit payload via socket
     */
    dequeueBuffer() {
        while (this.buffer && this.buffer.length > 0) {
            let { code, payload } = this.buffer[0];
            let isPayloadSent = this.sendCode(code, payload);
            if (isPayloadSent) {
                this.buffer.shift();
            }
        }
    }

    /**
     * @tag AigentConnector
     * @summary trigger
     * @description start buffer dequeue job to run dequeue buffer method at every 100ms interval
     */
    dequeueBufferTrigger() {
        this.dequeueBufferJob = setInterval(() => {
            this.dequeueBuffer();
        }, 100);
    }

    /**
     * @tag AigentConnector
     * @summary method
     * @description close a current connection. Signal end of the stream and clean buffer
     */
    clean() {
        clearTimeout(this.dequeueBufferJob);
        if (this.socket) {
            this.socket.close(1000);
            delete this.socket;
        }
        delete this.buffer;
    }

    /**
     * @tag AigentConnector
     * @summary method
     * @description transmit any leftover data in buffer and close current connection within 3 seconds
     */
    close() {
        const self = this;
        // console.log("buffer is", this.buffer);
        clearTimeout(this.dequeueBufferJob);
        if (this.buffer && this.buffer.length > 0) {
            if (this.socket.readyState === WebSocket.CONNECTING) {
                if (this.verbose) {
                    console.log(
                        "Connector: connection is connecting. Wait 1 second and try again to send all the data."
                    );
                }
                setTimeout(function () {
                    self.close();
                }, 1000);
                return;
            }
            if (this.verbose) {
                console.log("Connector: closing connection. Transmitting leftover data in buffer.");
            }

            this.dequeueBuffer();
            // setTimeout(function () {
            //     self.clean();
            // }, 3000);
            // self.clean();
        } else {
            // this.clean();
        }

        // allow websocket to be closed gracefully from the server side
    }

    /**
     * @tag AigentConnector
     * @summary method
     * @description true if a socket is connected and in ready state
     * @response true or false
     */
    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }
}

/**
 * @tag AigentConnector
 * @summary prepare the given payload for send
 * @description Uses internally by send method
 * @param {code} integer. Message type id
 * @param {payload} Uint8Array. Data being sent
 * @response Uint8Array encoded message
 */

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

function fromTimestampArrayToNumber(byteArray) {
    var value = 0;
    for (var i = byteArray.length - 1; i >= 0; i--) {
        value = value * 256 + byteArray[i];
    }

    return value;
}

function encode(code, payload) {
    const binCode = new Uint8Array([code & 0x00ff, (code & 0xff00) >> 8]);
    const binMsg = new Uint8Array(binCode.byteLength + timestampArrayLength + payload.byteLength);
    const timestampArray = generateTimestampArray();
    binMsg.set(binCode, 0);
    binMsg.set(timestampArray, binCode.byteLength);
    binMsg.set(payload, binCode.byteLength + timestampArrayLength);
    return binMsg;
}

/**
 * @tag AigentConnector
 * @summary generate unique call identifier.
 * @description generate uuidv4 using xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx schema
 * @param {code} integer. Message type id
 * @param {payload} Uint8Array. Data being sent
 * @response uuid string value
 */
function generateCallId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c == "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
