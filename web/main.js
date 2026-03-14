'use strict';

// Global vars
const mediaContainer = document.getElementById('mediaContainer');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const messageInput = document.getElementById('messageInput');
const messageOutput = document.getElementById('messageOutput');
const videoButton = document.getElementById('videoButton');
const videoIcon = videoButton.querySelector('img');
const sendMessageButton = document.getElementById('sendMessageButton');
const sendMessageIcon = sendMessageButton.querySelector('img');
const heading = document.querySelector('h1');
const headingIcon = heading.querySelector('img');

let peerConnection = null;
let dataChannel = null;
let mediaStreamSenders = [];
let isVideoOn = false;
const pageDomain = window.location.hostname;
const ws = new WebSocket(`ws://${pageDomain}:8000/ws`);

ws.onopen = event => console.log('WebSocket connection is open');
ws.onmessage = receiveWebSocketMessage;

// Set container height to video height set by aspect ratio. Height is required for styling e.g. overflow
mediaContainer.style.height = `${remoteVideo.clientHeight}px`;

videoButton.onclick = async event => {
    if(isVideoOn) {
        isVideoOn = false;
        videoIcon.src = 'videocam_48dp_B3E5A0_FILL0_wght100_GRAD0_opsz48.svg';
        await endVideoTransmission();
    } else { // Video off
        isVideoOn = true;
        videoIcon.src = 'videocam_off_48dp_B3E5A0_FILL0_wght100_GRAD0_opsz48.svg';
        await transmitVideo();
    }
    
}
videoButton.onmouseenter = event => videoIcon.src = isVideoOn? 'videocam_off_48dp_B3E5A0_FILL0_wght100_GRAD0_opsz48.svg' : 'videocam_48dp_B3E5A0_FILL0_wght100_GRAD0_opsz48.svg';
videoButton.onmouseleave = event => videoIcon.src = isVideoOn? 'videocam_off_48dp_999999_FILL0_wght100_GRAD0_opsz48.svg' : 'videocam_48dp_999999_FILL0_wght100_GRAD0_opsz48.svg';

sendMessageButton.onclick = event => sendMessage(messageInput.value);
messageInput.onkeydown = event => {
    if(event.key === 'Enter'){
        sendMessage(messageInput.value);
    }
}

sendMessageIcon.onmouseenter = event => sendMessageIcon.src = 'send_48dp_B3E5A0_FILL0_wght100_GRAD0_opsz48.svg';
sendMessageIcon.onmouseleave = event => sendMessageIcon.src = 'send_48dp_999999_FILL0_wght100_GRAD0_opsz48.svg';

heading.onmouseenter = event => headingIcon.src = 'chat_bubble_48dp_B3E5A0_FILL0_wght100_GRAD0_opsz48.svg';
heading.onmouseleave = event => headingIcon.src = 'chat_dashed_48dp_999999_FILL0_wght100_GRAD0_opsz48.svg';


async function startLocalVideo() {
    try {
        console.log('Starting local video/media stream...');
        
        const mediaStreamConstraints = {
            // Enable video with precise resolution and audio 
            video: {
                width: { exact: 1280 },
                height: { exact: 720 }
            }, 
            audio: true,
        }
        
        // Ask user for permission and get stream to local webcam.
        return await navigator.mediaDevices.getUserMedia(mediaStreamConstraints);
    } catch(err) {
        console.error('Something went wrong start local video media stream:', err)
    }

    return null;
}

function stopLocalVideo() {
    console.log('Stopping local video/media stream...');

    // Release camera + mic resources by stopping media stream tracks
    localVideo.srcObject.getTracks().forEach(track => track.stop());
    localVideo.classList.add('hidden'); // Hide <video>
}

function receiveMediaStream(event) {
    console.log('Receiving remote peer media stream...');

    // Apply media stream to remove video
    const mediaStream = event.streams[0];
    remoteVideo.srcObject = mediaStream;
    mediaStream.onremovetrack = event => {
        console.log('No longer receiving remote peer video/media stream');
        remoteVideo.srcObject = null; // Remove video from page
    }
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

function sendMessage(message) {
    addMessageToPage(message, true);
    sendDataChannelMessage(message);
}

function addMessageToPage(message, isSender) {
    const chatParentElement = document.createElement('div');
    chatParentElement.className = `chat m-1 ${isSender? 'chat-start' : 'chat-end'}`;
    
    const chatChildElement = document.createElement('div');
    chatChildElement.textContent = message;
    chatChildElement.className = `chat-bubble ${isSender? 'bg-lime-300' : ''}`;

    chatParentElement.append(chatChildElement);
    messageOutput.append(chatParentElement);

    // Auto scroll to latest message
    messageOutput.scrollTop = messageOutput.scrollHeight;
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

async function transmitVideo() {
    console.log('Starting call...');

    const mediaStream = await startLocalVideo();

    // Stream media stream to receiver
    mediaStream.getTracks().forEach(track => mediaStreamSenders.push(peerConnection.addTrack(track, mediaStream)));
    localVideo.srcObject = mediaStream; // Render in-page video
    localVideo.classList.remove('hidden'); // Display <video>

    console.log('Call started');
}

async function endVideoTransmission() {
    console.log('Ending call...');

    stopLocalVideo();

    // Remove video from page (will still show last frame after stopLocalVideo())
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    // So remote peer will receive MediaStream.removetrack event
    mediaStreamSenders.forEach(sender => peerConnection.removeTrack(sender));
    mediaStreamSenders = [];

    console.log('Call ended');
}