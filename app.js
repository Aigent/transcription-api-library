import { AigentConnector } from "./AigentConnector.js";
import fs from "fs";
import { KeycloakConnector } from "./keycloak.js";

const username = process.env.KEYCLOAK_SERVICE_USERNAME;
const password = process.env.KEYCLOAK_SERVICE_PASSWORD;
const token_endpoint = process.env.KEYCLOAK_TOKEN_ENDPOINT;

const keycloak = new KeycloakConnector(username, password, token_endpoint);

const AIGENT_API_URL = process.env.AIGENT_API_URL || "wss://ingress.aigent.ai/connector";

const AUDIO_FILE = process.env.AUDIO_FILE || "audio-file/sentences.wav";

function generateCallId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c == "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// voice metadata template
const metadataTemplate = {
    voice: {
        channel: "agent", // client|agent (mandatory field)
        clientCallId: "generate-call-id", // (mandatory field, must be unique per a call)
        codec: "s16le", // (mandatory field) allows us to convert data to our desired format
        // currently support for g729, pcm mulaw, alaw, libopus (with audioContainer set to webm)
        audioContainer: "", // (mandatory field), empty if none, this tells us how to extract the audio
        samplingRate: 8000, // (mandatory field)
        direction: "outbound", // inbound|outbound (inbound is default)
    },
    agentWindowsUsername: "corp//alex", // (mandatory field)
    clientId: "clientId", // (mandatory field)
    agentId: "agentId", // (mandatory field)
    category: "client-category", // (optional field)
    ani: "client-phone-number", // (optional field, but some features might not be available)
    programId: "programId", // (optional field)
};

let callId = generateCallId();
const agentMetadata = { ...metadataTemplate };
agentMetadata.voice = { ...metadataTemplate.voice };
agentMetadata.voice.channel = "agent";
agentMetadata.voice.clientCallId = callId;

const clientMetadata = { ...metadataTemplate };
clientMetadata.voice = { ...metadataTemplate.voice };
clientMetadata.voice.channel = "client";
clientMetadata.voice.clientCallId = callId;

const audio = fs.readFileSync(AUDIO_FILE);

let agentStream = new AigentConnector(AIGENT_API_URL, agentMetadata, "", "", true);
let clientStream = new AigentConnector(AIGENT_API_URL, clientMetadata, "", "", true);

// Tokens expire so make sure to get a new one before starting the stream
keycloak
    .getToken()
    .then(async token => {
        agentStream.startStream(token);
        clientStream.startStream(token);
        let offset = 8000;
        for (let position = 0; position < audio.length; position += offset) {
            // 10 bytes offset to create g729 10 milliseconds frames, this is to emulate a real call
            const audioSlice = audio.slice(position, position + offset);
            agentStream.sendVoice(audioSlice);
            clientStream.sendVoice(audioSlice);
            // await pause10Ms();
        }
        agentStream.sendFlush();
        clientStream.sendFlush();
        agentStream.close();
        clientStream.close();
        // close ends the connection and the call from the aigent POV
        // setTimeout(function () {
        //     agentStream.close();
        //     clientStream.close();
        // }, 5000);
        // end the call after 30 seconds to make sure the data is sent through the websocket
    })
    .catch(err => {
        console.log("error while getting keycloak token", err);
    });

// return promise after 10 ms
function pause10Ms() {
    return new Promise(resolve => {
        setTimeout(resolve, 10);
    });
}
