'use strict';

// Global vars
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startCallButton = document.getElementById('startCallButton');
const endCallButton = document.getElementById('endCallButton');

async function startLocalVideo() {
    try {
        const mediaStreamConstraints = {
            video: true, // Enable video
            audio: true, // Enable mic
        }

        // Ask user for permission and get stream to local webcam.
        const mediaStream = await navigator.mediaDevices.getUserMedia(mediaStreamConstraints);
        localVideo.srcObject = mediaStream; // Render in-page video

        return mediaStream;
    } catch(err) {
        console.log('User blocked media stream or something went wrong', err);
    }

    return null;
}

function stopLocalVideo() {
    // Release camera + mic resources by stopping media stream tracks
    localVideo.srcObject?.getTracks().forEach(track => track.stop());
}

function handleTransportedLocalVideo(event) {
    console.log('Receiving local peer video...');

    // Apply media stream to remove video
    remoteVideo.srcObject = event.streams[0];
}

async function findIceCandidates(event, otherPeerConnection) {
    // ICE networking technique to find best path to connect peers
    // Generally requires STUN server due to NATs
    // const peerConnection = event.target; // For reference
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
        console.error('Something went wrong exchanging media metadata', err);
    }
}

async function startPeerConnection(localMediaStream) {
    const servers = null; // STUN/TURN server config

    console.log('Starting peer-peer connection...');
    const localPeerConnection = new RTCPeerConnection(servers);
    const remotePeerConnection = new RTCPeerConnection(servers);
    
    localPeerConnection.name = localPeerConnection.name ?? 'localPeerConnection';
    remotePeerConnection.name = remotePeerConnection.name ?? 'RemotePeerConnection';

    // Add local video tracks to be streamed to receiver
    localMediaStream.getTracks().forEach(
        track => localPeerConnection.addTrack(track, localMediaStream)
    );

    // Upon sender (local peer) adding tracks
    remotePeerConnection.ontrack = handleTransportedLocalVideo;
    
    localPeerConnection.onicecandidate = event => findIceCandidates(event, remotePeerConnection);
    remotePeerConnection.onicecandidate = event => findIceCandidates(event, localPeerConnection);

    await exchangeMediaMetadata(localPeerConnection, remotePeerConnection);
}

async function startCall() {
    // Invert allowed actions
    startCallButton.disabled = true;
    endCallButton.disabled = false;

    console.log('Starting call...');
    const mediaStream = await startLocalVideo();
    await startPeerConnection(mediaStream);

    console.log('Call started');
}

async function endCall() {
    console.log('Ending call...');

    // Invert allowed actions
    startCallButton.disabled = false;
    endCallButton.disabled = true;

    stopLocalVideo();

    // Remove video from page (will still show last frame after camera stopped)
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    console.log('Call ended');
}

startCallButton.onclick = startCall;
endCallButton.disabled = true; // Can't end call until you start it
endCallButton.onclick = endCall;

