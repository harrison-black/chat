'use strict';

// Global vars
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localMessageArea = document.getElementById('localMessage');
const remoteMessageArea = document.getElementById('remoteMessage');
const startCallButton = document.getElementById('startCallButton');
const endCallButton = document.getElementById('endCallButton');
const sendMessageButton = document.getElementById('sendMessageButton');
let localPeerConnection = null;
let localDataChannel = null;
const ws = new WebSocket("ws://localhost:8000/ws")

startCallButton.onclick = startCall;
endCallButton.disabled = true; // Can't end call until you start it
endCallButton.onclick = endCall;
sendMessageButton.onclick = sendLocalMessage;

startPeerConnection();


async function startLocalVideo() {
    try {
        console.log('Starting local video...');
        
        const mediaStreamConstraints = {
            video: true, // Enable video
            audio: true, // Enable mic
        }
        
        // Ask user for permission and get stream to local webcam.
        const localMediaStream = await navigator.mediaDevices.getUserMedia(mediaStreamConstraints);

        // Stream media stream to receiver
        localMediaStream.getTracks().forEach(track => localPeerConnection.addTrack(track, localMediaStream));
        localVideo.srcObject = localMediaStream; // Render in-page video
    } catch(err) {
        console.error('Something went wrong start local video media stream')
    }
}

function stopLocalVideo() {
    console.log('Stopping local video...');

    // Release camera + mic resources by stopping media stream tracks
    localVideo.srcObject.getTracks().forEach(track => track.stop());
}

function receiveMediaStreamCallback(event) {
    console.log('Receiving local peer video...');

    // Apply media stream to remove video
    remoteVideo.srcObject = event.streams[0];
}

async function addIceCandidates(event, otherPeerConnection) {
    // ICE networking technique to find best path to connect peers
    // Generally requires STUN server due to NATs
    // const peerConnection = event.target; // Can find RTCPeerConnection this way
    const iceCandidate = event.candidate;

    console.log(`Attempting to add ICE candidate ${iceCandidate?.candidate} with address ${iceCandidate?.address} to ${otherPeerConnection.name}`);

    if(iceCandidate) {
        try {
            const rtcIceCandidate = new RTCIceCandidate(iceCandidate);
            await otherPeerConnection.addIceCandidate(rtcIceCandidate);
            console.log(`ICE candidate ${iceCandidate.candidate} added to ${otherPeerConnection.name}`);
        } catch(err) {
            console.error(`Error adding ICE candidate ${iceCandidate.candidate} to ${otherPeerConnection.name}`)
        }
    }
}

async function exchangeMediaMetadata(localPeerConnection, remotePeerConnection) {
    try {
        // Exchange media metadata between peers (resolution, codec etc)
        const offer = await localPeerConnection.createOffer();
        console.log(`Offer created ${offer.sdp}`);

        await localPeerConnection.setLocalDescription(offer);
        await remotePeerConnection.setRemoteDescription(offer);

        const answer = await remotePeerConnection.createAnswer();
        console.log(`Answer created ${answer.sdp}`);

        await localPeerConnection.setRemoteDescription(answer);
        await remotePeerConnection.setLocalDescription(answer);
    } catch(err) {
        console.error('Something went wrong exchanging metadata', err);
    }
}

function receiveDataChannelValueCallback(event) {
    console.log('Receiving local data channel...');
    const channel = event.channel;

    // Upon message received from data channel assign to peer text area
    channel.onmessage = event => remoteMessageArea.value = event.data;
}


function startPeerConnection() {
    console.log('Starting peer->peer connection...');

    const servers = null; // STUN/TURN server config

    // For SCTP (WebRTC data channel protocol), reliable and ordered delivery 
    // is true by default.
    localPeerConnection = new RTCPeerConnection(servers);
    const remotePeerConnection = new RTCPeerConnection(servers);
    
    localPeerConnection.name = localPeerConnection.name ?? 'local peer conection';
    remotePeerConnection.name = remotePeerConnection.name ?? 'remote peer connection';

    // Below event functions are very IMPORTANT to have correct timing for WebRTC logic

    // Upon sender (local peer) adding tracks
    remotePeerConnection.ontrack = receiveMediaStreamCallback;
    
    // Create data channel for messaging.
    // Must be created before metadata exchange!
    localDataChannel = localPeerConnection.createDataChannel('message_channel');
    remotePeerConnection.ondatachannel = receiveDataChannelValueCallback; // Upon data being sent

    // Upon media metadata negotiation needed
    localPeerConnection.onnegotiationneeded = () => exchangeMediaMetadata(localPeerConnection, remotePeerConnection);

    // Upon ICE candidate being identified
    localPeerConnection.onicecandidate = event => addIceCandidates(event, remotePeerConnection);
    remotePeerConnection.onicecandidate = event => addIceCandidates(event, localPeerConnection);

    console.log('Peer->peer initiation steps invoked');
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

function sendLocalMessage() {
    const message = localMessageArea.value;
    console.log(`Sending message "${message}" on local data channel...`);
    localDataChannel.send(message);

    ws.send(message)
    ws.onmessage = event => console.log(event.data)
}