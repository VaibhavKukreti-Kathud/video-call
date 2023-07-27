import { initializeApp } from 'firebase/app';
import 'firebase/firestore';
import { collection, getDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { setDoc } from 'firebase/firestore';
import { doc } from 'firebase/firestore';
import { onSnapshot } from 'firebase/firestore';
import { addDoc } from 'firebase/firestore';
import { updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBFMpwl-ki07wYshoVZFSWtg9vJAjZcl3w",
  authDomain: "video-call-e90a6.firebaseapp.com",
  projectId: "video-call-e90a6",
  storageBucket: "video-call-e90a6.appspot.com",
  messagingSenderId: "267656164199",
  appId: "1:267656164199:web:5730e315f4d520e5cd35c2"
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callButton = document.getElementById('callButton');
const answerButton = document.getElementById('answerButton');
const callInput = document.getElementById('callInput');
const hangupButton = document.getElementById('hangupButton');

hangupButton.onclick = async () => {
  console.log('hangupButton clicked');
  const tracks = webcamVideo.srcObject.getTracks();
  tracks.forEach(track => track.stop());

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (pc) {
    pc.close();
  }
  webcamVideo.srcObject = null;
  remoteVideo.srcObject = null;
};

webcamButton.onclick = async () => {
  console.log('webcamButton clicked');
  // Get stream from webcam , add to video
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  remoteStream = new MediaStream();

  // Pull tracks from remote stream , add to video stream
  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
  };

  remoteVideo.srcObject = remoteStream;
  webcamVideo.srcObject = localStream;
};

callButton.onclick = async () => {
  console.log('callButton clicked');
  // Reference Firestore collections for signaling
  const callCollection = collection(firestore, "calls");
  const callDoc = doc(callCollection);
  const offerCandidates = collection(firestore, "calls", callDoc.id, "offerCandidates");
  const answerCandidates = collection(firestore, "calls", callDoc.id, 'answerCandidates');

  callInput.value = callDoc.id;

  // Get candidates for caller , save to db
  pc.onicecandidate = event => {
    event.candidate && addDoc(offerCandidates, event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  // await callDoc.set({ offer });
  await setDoc(callDoc, offer);

  // Listen for remote answer
  onSnapshot(callDoc, async (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });


  // Listen for remote ICE candidates
  onSnapshot(answerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });
}
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callCollection = collection(firestore, 'calls');
  const callDoc = doc(callCollection, callId);
  const offerCandidates = collection(callDoc, 'offerCandidates');
  const answerCandidates = collection(callDoc, 'answerCandidates');

  pc.onicecandidate = event => {
    event.candidate && add(answerCandidates, event.candidate.toJSON());
  };

  // Fetch data , then set the offer & answer

  const callData = await (await getDoc(callDoc)).data();
  console.log(callData);

  const offerDescription = callData;
  // await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
  // await pc.setRemoteDescription(new RTCSessionDescription({ "sdp": callData[0], "type": callData[1] }));
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  // await callDoc.update({ answer });
  await updateDoc(callDoc, { answer });

  // Listen to offer candidates

  onSnapshot(offerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change)
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });

};

