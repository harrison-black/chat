'use strict';

// Global vars
const mediaContainer = document.getElementById('mediaContainer');
const mediaContainerIcon = mediaContainer.querySelector('img');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const messageInput = document.getElementById('messageInput');
const messageOutput = document.getElementById('messageOutput');
const messageOutputIcon = messageOutput.querySelector('img');
const videoButton = document.getElementById('videoButton');
const videoIcon = videoButton.querySelector('img');
const sendMessageButton = document.getElementById('sendMessageButton');
const sendMessageIcon = sendMessageButton.querySelector('img');
const clearMessageButton = document.getElementById('clearMessageButton');
const clearMessageIcon = clearMessageButton.querySelector('img');
const heading = document.querySelector('h1');
const headingIcon = heading.querySelector('img');
const body = document.querySelector('body');

let peerConnection = null;
let dataChannel = null;
let mediaStreamSenders = [];
let isVideoOn = false;
let heightResizeTimeout = null;
const pageDomain = window.location.hostname;
const ws = new WebSocket(`ws://${pageDomain}:8000/ws`);

ws.onopen = event => console.log('WebSocket connection is open');
ws.onmessage = receiveWebSocketMessage;

adjustContainerElementHeight();
adjustMediaContainerIcon();

// Needs reapplying on window resize
window.onresize = event => {
    //Set timeout to debounce changes for performance.
    window.clearTimeout(heightResizeTimeout);
    heightResizeTimeout = window.setTimeout(adjustContainerElementHeight, 250);

    adjustMediaContainerIcon();
}

messageInput.value = ''; // Reset message input on page load

messageInput.onkeydown = event => {
    if(event.key === 'Enter'){
        sendMessage(messageInput.value);
    }

    // Note messageInput.value's content doesn't reflect yet the current key being pressed
    if(event.key === 'Backspace' && messageInput.value?.length <= 1) {
        clearMessageButton.classList.add('invisible');
    } else { // Message has been written
        clearMessageButton.classList.remove('invisible');
    }
}

videoButton.onclick = async event => {
    if(isVideoOn) { // End video related logic
        isVideoOn = false;
        mediaContainerIcon.classList.remove('hidden');
        videoIcon.src = 'icon/videocam_48dp_B3E5A0_FILL0_wght100_GRAD0_opsz48.svg';
        await endVideoTransmission();
    } else { // Video off, start video related logic
        isVideoOn = true;
        videoIcon.src = 'icon/videocam_off_48dp_B3E5A0_FILL0_wght100_GRAD0_opsz48.svg';
        await transmitVideo();
        mediaContainerIcon.classList.add('hidden');
    }
    
}
videoButton.onmouseenter = event => videoIcon.src = isVideoOn? 'icon/videocam_off_48dp_B3E5A0_FILL0_wght100_GRAD0_opsz48.svg' : 'icon/videocam_48dp_B3E5A0_FILL0_wght100_GRAD0_opsz48.svg';
videoButton.onmouseleave = event => videoIcon.src = isVideoOn? 'icon/videocam_off_48dp_999999_FILL0_wght100_GRAD0_opsz48.svg' : 'icon/videocam_48dp_999999_FILL0_wght100_GRAD0_opsz48.svg';

sendMessageButton.onclick = event => sendMessage(messageInput.value);
sendMessageButton.onmouseenter = event => sendMessageIcon.src = 'icon/send_60dp_B3E5A0_FILL0_wght100_GRAD0_opsz60.svg';
sendMessageButton.onmouseleave = event => sendMessageIcon.src = 'icon/send_60dp_999999_FILL0_wght100_GRAD0_opsz60.svg';

clearMessageButton.onclick = event => {
    messageInput.value = '';
    clearMessageButton.classList.add('invisible');
}
clearMessageButton.onmouseenter = event => clearMessageIcon.src = 'icon/cancel_32dp_B3E5A0_FILL0_wght100_GRAD0_opsz32.svg';
clearMessageButton.onmouseleave = event => clearMessageIcon.src = 'icon/cancel_32dp_999999_FILL0_wght100_GRAD0_opsz32.svg';

heading.onmouseenter = event => headingIcon.src = 'icon/chat_bubble_48dp_B3E5A0_FILL0_wght100_GRAD0_opsz48.svg';
heading.onmouseleave = event => headingIcon.src = 'icon/chat_dashed_48dp_999999_FILL0_wght100_GRAD0_opsz48.svg';


function adjustContainerElementHeight() {
    // Set body height to apply background styling to entire visible page/viewport
    const overflowY = body.scrollHeight - window.innerHeight;
    body.style.height = `${overflowY > 0? body.scrollHeight : window.innerHeight}px`;

    // Set container height to video height set by aspect ratio. Height is required for styling e.g. overflow
    mediaContainer.style.height = `${remoteVideo.clientHeight}px`;

    
}

function adjustMediaContainerIcon() {
    if(window.innerWidth < 1000) {
        mediaContainerIcon.src = 'icon/frame_person_300dp_EFEFEF_FILL0_wght100_GRAD0_opsz300.svg';
    } else {
        mediaContainerIcon.src = 'icon/frame_person_430dp_EFEFEF_FILL0_wght100_GRAD0_opsz430.svg';
    }
}

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
    mediaContainerIcon.classList.add('hidden');

    // Apply media stream to page
    const mediaStream = event.streams[0];
    remoteVideo.srcObject = mediaStream;

    mediaStream.onremovetrack = event => {
        console.log('No longer receiving remote peer video/media stream');
        remoteVideo.srcObject = null; // Remove video from page

        if(isVideoOn) {
            mediaContainerIcon.classList.add('hidden');
        } else { // Video off
            mediaContainerIcon.classList.remove('hidden');
        }
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
    messageOutputIcon.classList.add('hidden')
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