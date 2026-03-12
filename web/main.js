'use strict';

// Global vars
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localMessageArea = document.getElementById('messageInput');
const remoteMessageArea = document.getElementById('messageOutput');
const startCallButton = document.getElementById('startCallButton');
const endCallButton = document.getElementById('endCallButton');
const sendMessageButton = document.getElementById('sendMessageButton');
let peerConnection = null;
let dataChannel = null;
const pageDomain = window.location.hostname;
const ws = new WebSocket(`ws://${pageDomain}:8000/ws`);

startCallButton.onclick = startCall;
endCallButton.disabled = true; // Can't end call until you start it
endCallButton.onclick = endCall;
sendMessageButton.onclick = event => {
    const message = localMessageArea.value;
    addMessageToPage(message, true);
    sendDataChannelMessage(message);
}

ws.onopen = event => console.log('WebSocket connection is open');
ws.onmessage = receiveWebSocketMessage;


async function startLocalVideo() {
    try {
        console.log('Starting local video...');
        
        const mediaStreamConstraints = {
            // Enable video with precise resolution and audio 
            video: {
                width: { exact: 1280 },
                height: { exact: 720 }
            }, 
            audio: true,
        }
        
        // Ask user for permission and get stream to local webcam.
        const localMediaStream = await navigator.mediaDevices.getUserMedia(mediaStreamConstraints);

        // Stream media stream to receiver
        localMediaStream.getTracks().forEach(track => peerConnection.addTrack(track, localMediaStream));
        localVideo.srcObject = localMediaStream; // Render in-page video
    } catch(err) {
        console.error('Something went wrong start local video media stream:', err)
    }
}

function stopLocalVideo() {
    console.log('Stopping local video...');

    // Release camera + mic resources by stopping media stream tracks
    localVideo.srcObject.getTracks().forEach(track => track.stop());
}

function receiveMediaStream(event) {
    console.log('Receiving remote peer video...');

    // Apply media stream to remove video
    remoteVideo.srcObject = event.streams[0];
}

function sendWebSocketMessage(objectToSend) {
    try {
        ws.send(JSON.stringify(objectToSend));
    } catch(err) {
        console.error('Error sending WebSocket message:', err);
    }
}

async function receiveWebSocketMessage(event){
    const receivedObject = JSON.parse(event.data);
    const { status, candidate, offer, answer } = receivedObject;

    // Remote peer sent ICE candidate, mediadata (offer or answer)
    // Separate communications
    if(status) {
        console.log(`Peer connection status: ${status}`)

        if(status === 'READY') { // Don't start process until both peers connected
            initPeerConnection();
        }
    } else if(candidate) {
        console.log(`Candidate received: ${JSON.stringify(candidate)}`);
        await peerConnection.addIceCandidate(candidate);
    } else if(offer) {
        console.log(`Offer received: ${JSON.stringify(offer)}`);
        await peerConnection.setRemoteDescription(offer);

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        sendWebSocketMessage({ answer });
        console.log(`Replied with answer: ${JSON.stringify(answer)}`);
    } else if(answer) {
        console.log(`Answer received: ${JSON.stringify(answer)}`);
        await peerConnection.setRemoteDescription(answer);
    } else {
        console.warn(`Received unhandled web socket message: ${JSON.stringify(receivedObject)}`)
    }
}

async function sendIceCandidate(event) {
    // ICE networking technique to find best path to connect peers
    // Generally requires STUN server due to NATs
    // const peerConnection = event.target; // Can find RTCPeerConnection this way
    const iceCandidate = event.candidate;

    console.log(`Sending ICE candidate ${iceCandidate?.candidate} with address ${iceCandidate?.address}`);

    if(iceCandidate) {
        try {
            const candidate = new RTCIceCandidate(iceCandidate);
            sendWebSocketMessage({ candidate });
            console.log(`ICE candidate ${iceCandidate.candidate} with address ${iceCandidate?.address} added`);
        } catch(err) {
            console.error(`Error sending ICE candidate ${iceCandidate.candidate} with address ${iceCandidate?.address}`, err);
        }
    }
}

async function createOffer() {
    try {
        const offer = await peerConnection.createOffer();
        console.log(`Offer created ${offer.sdp}`);

        await peerConnection.setLocalDescription(offer);
        sendWebSocketMessage({ offer });
    } catch(err) {
        console.error('Something went wrong exchanging metadata', err);
    }
}

function sendDataChannelMessage(message) {
    console.log(`Sending message "${message}" on data channel...`);
    dataChannel.send(message);
}

function receiveRemoteDataChannel(event) {
    const channel = event.channel;
    channel.onopen = event => console.log('Received data channel is open');
    
    // Upon message received from data channel assign to peer text area
    channel.onmessage = event => {
        const message = event.data;
        console.log(`Receiving remote data channel value: ${JSON.stringify(message)}`);
        addMessageToPage(message, false);
    }
}

function addMessageToPage(message, isSender) {
    const chatParentElement = document.createElement('div');
    chatParentElement.className = `chat ${isSender? 'chat-start ml-2' : 'chat-end mr-2'}`;
    
    const chatChildElement = document.createElement('div');
    chatChildElement.textContent = message;
    chatChildElement.className = 'chat-bubble';

    chatParentElement.append(chatChildElement);
    remoteMessageArea.append(chatParentElement);
}

function initPeerConnection() {
    console.log('Initialising peer -> peer connection...');

    const config = {
        iceServers: [{urls: 'stun:stun.l.google.com'}] // STUN or TURN server config
    }

    // For SCTP (WebRTC data channel protocol), reliable and ordered delivery 
    // is true by default.
    peerConnection = new RTCPeerConnection(config);
    // const remotePeerConnection = new RTCPeerConnection(servers);
    
    // Below event functions are IMPORTANT to have correct timing for WebRTC logic
    // Upon sender adding tracks
    peerConnection.ontrack = receiveMediaStream;
    
    // Create data channel for messaging and listen for received messages
    dataChannel = peerConnection.createDataChannel('message_data_channel');
    peerConnection.ondatachannel = receiveRemoteDataChannel;

    // Upon media metadata negotiation needed
    peerConnection.onnegotiationneeded = createOffer;

    // Upon ICE candidate being identified
    peerConnection.onicecandidate = sendIceCandidate;

    console.log('Peer -> peer connection initialised');
}

async function startCall() {
    console.log('Starting call...');

    // Invert allowed actions
    startCallButton.disabled = true;
    endCallButton.disabled = false;

    await startLocalVideo();

    console.log('Call started');
}

async function endCall() {
    console.log('Ending call...');

    // Invert allowed actions
    startCallButton.disabled = false;
    endCallButton.disabled = true;

    stopLocalVideo();

    // Remove video from page (will still show last frame after stopLocalVideo())
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    console.log('Call ended');
}