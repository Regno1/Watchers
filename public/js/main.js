const socket = io();

// UI Elements
const joinOverlay = document.getElementById("join-overlay");
const roomIdInput = document.getElementById("room-id");
const usernameInput = document.getElementById("username");
const joinRoomBtn = document.getElementById("join-room-btn");

// Check sessionStorage for room ID
const savedRoomId = sessionStorage.getItem('watchers_room_id');
if (savedRoomId) {
    roomIdInput.value = savedRoomId;
    sessionStorage.removeItem('watchers_room_id');
}

const allusersHtml = document.getElementById("allusers");
const localVideo = document.getElementById("localVideo");
const videoGrid = document.getElementById("video-grid");
const muteButton = document.getElementById("mute-call-btn");

const youtubeUrlInput = document.getElementById("youtube-url");
const youtubePlayer = document.getElementById("youtube-player");
const loadYoutubeVideoButton = document.getElementById("load-youtube-video");
const uploadInput = document.getElementById("video-url");
const uploadBtn = document.getElementById("load-video");
const mediaPlayerContainer = document.getElementById("media-player-container");

const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");
const sendChatBtn = document.getElementById("send-chat-btn");

// State
let localStream;
let myUsername = "";
let myRoomId = "";
let isMuted = false;
let peers = {};

// WebRTC Config
const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// ==========================
// 1. Media Setup
// ==========================
const startMyVideo = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    localStream = stream;
    localVideo.srcObject = stream;
  } catch (error) {
    console.error("Error accessing media devices:", error);
    alert("Could not access camera/microphone. Please allow permissions.");
  }
};

// ==========================
// 2. Room Joining
// ==========================
joinRoomBtn.addEventListener("click", async () => {
  myUsername = usernameInput.value.trim();
  myRoomId = roomIdInput.value.trim();
  
  if (myUsername && myRoomId) {
    joinOverlay.style.display = "none";
    await startMyVideo();
    socket.emit("join-room", { roomId: myRoomId, username: myUsername });
    
    // Update local video label
    const localLabel = document.getElementById("local-label");
    if (localLabel) localLabel.textContent = myUsername + " (You)";
  } else {
    alert("Please enter both Room ID and Nickname.");
  }
});

// Also support Enter key
roomIdInput.addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoomBtn.click(); });
usernameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoomBtn.click(); });

// ==========================
// 3. Socket Events - Room Management
// ==========================
function updateParticipantsList(users) {
  allusersHtml.innerHTML = "";
  for (const id in users) {
    const user = users[id];
    const li = document.createElement("li");
    li.textContent = `${user.username} ${id === socket.id ? "(You)" : ""}`;
    allusersHtml.appendChild(li);
  }
}

socket.on("room-joined", ({ roomId, users, host, me }) => {
  updateParticipantsList(users);
  
  const roomHeader = document.getElementById("room-header");
  const displayRoomId = document.getElementById("display-room-id");
  if (roomHeader && displayRoomId) {
      displayRoomId.textContent = roomId;
      roomHeader.style.display = 'flex';
      displayRoomId.onclick = () => {
          navigator.clipboard.writeText(roomId);
          const originalText = displayRoomId.textContent;
          displayRoomId.textContent = "✓ Copied!";
          setTimeout(() => displayRoomId.textContent = originalText, 2000);
      };
  }
});

socket.on("user-joined", async ({ username, id, users }) => {
  updateParticipantsList(users);
  
  if (localStream) {
    createPeerConnection(id, username);
    const pc = peers[id].pc;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { to: id, offer, username: myUsername });
    } catch (err) {
      console.error("Error creating offer:", err);
    }
  }
});

socket.on("user-disconnected", ({ id, users }) => {
  updateParticipantsList(users);
  if (peers[id]) {
    peers[id].pc.close();
    if (peers[id].videoWrapper) {
      peers[id].videoWrapper.remove();
    }
    delete peers[id];
  }
});

// ==========================
// 4. WebRTC Mesh Logic
// ==========================
function createPeerConnection(remoteSocketId, remoteUsername) {
  const pc = new RTCPeerConnection(rtcConfig);

  if (localStream) {
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  }

  pc.ontrack = (event) => {
    if (!peers[remoteSocketId].video) {
      const wrapper = document.createElement("div");
      wrapper.className = "video-wrapper";
      
      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.srcObject = event.streams[0];
      
      const label = document.createElement("span");
      label.className = "video-label";
      label.textContent = peers[remoteSocketId].username || "Guest";
      
      wrapper.appendChild(video);
      wrapper.appendChild(label);
      videoGrid.appendChild(wrapper);
      
      peers[remoteSocketId].video = video;
      peers[remoteSocketId].videoWrapper = wrapper;
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("icecandidate", { to: remoteSocketId, candidate: event.candidate });
    }
  };

  if (!peers[remoteSocketId]) {
      peers[remoteSocketId] = { pc, username: remoteUsername, iceQueue: [] };
  } else {
      peers[remoteSocketId].pc = pc;
      peers[remoteSocketId].username = remoteUsername;
  }
  
  return pc;
}

socket.on("offer", async ({ from, offer, username }) => {
  const pc = createPeerConnection(from, username || "User");
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer", { to: from, answer });
  
  if (peers[from].iceQueue && peers[from].iceQueue.length > 0) {
      for (const candidate of peers[from].iceQueue) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      peers[from].iceQueue = [];
  }
});

socket.on("answer", async ({ from, answer }) => {
  if (peers[from]) {
    await peers[from].pc.setRemoteDescription(answer);
    if (peers[from].iceQueue && peers[from].iceQueue.length > 0) {
        for (const candidate of peers[from].iceQueue) {
            await peers[from].pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        peers[from].iceQueue = [];
    }
  }
});

socket.on("icecandidate", async ({ from, candidate }) => {
  if (peers[from]) {
    try {
      if (peers[from].pc && peers[from].pc.remoteDescription) {
          await peers[from].pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
          peers[from].iceQueue.push(candidate);
      }
    } catch (err) {
      console.error("Error adding ICE candidate:", err);
    }
  }
});

// ==========================
// 5. Call Controls (Mute)
// ==========================
muteButton.addEventListener("click", () => {
  if (!localStream) return;
  const audioTracks = localStream.getAudioTracks();
  if (audioTracks.length > 0) {
    isMuted = !isMuted;
    audioTracks[0].enabled = !isMuted;

    // Show unmute icon when muted (to indicate "click to unmute")
    muteButton.innerHTML = isMuted
      ? '<img src="/images/unmute.png" alt="Unmute">'
      : '<img src="/images/mute.png" alt="Mute">';
    
    if (isMuted) {
      muteButton.style.backgroundColor = 'var(--danger-color)';
      muteButton.style.borderColor = 'var(--danger-color)';
      muteButton.title = 'Click to Unmute';
    } else {
      muteButton.style.backgroundColor = '';
      muteButton.style.borderColor = '';
      muteButton.title = 'Click to Mute';
    }
  }
});

// ==========================
// 6. Chat Logic
// ==========================
sendChatBtn.addEventListener("click", () => {
  const message = chatInput.value.trim();
  if (message) {
    socket.emit("chat-message", { username: myUsername, message });
    addChatMessage({ username: "You", message });
    chatInput.value = "";
  }
});

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendChatBtn.click();
  }
});

socket.on("chat-message", addChatMessage);

function addChatMessage({ username, message }) {
  const messageDiv = document.createElement("div");
  messageDiv.className = "chat-msg";
  messageDiv.innerHTML = `<strong>${username}</strong><div class="chat-msg-text">${escapeHtml(message)}</div>`;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==========================
// 7. Media Sharing
// ==========================
function clearMediaPlayer() {
  const otherMedia = mediaPlayerContainer.querySelectorAll("video, img");
  otherMedia.forEach((el) => el.remove());
}

// YouTube Loading
loadYoutubeVideoButton.addEventListener("click", () => {
  const youtubeUrl = youtubeUrlInput.value.trim();
  const videoId = extractYoutubeVideoId(youtubeUrl);

  if (videoId) {
    clearMediaPlayer();
    youtubePlayer.style.display = "block";

    const timestamp = Date.now();
    youtubePlayer.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1`;
    socket.emit("sync-youtube-video", { videoId, timestamp });
  } else {
    alert("Invalid YouTube URL");
  }
});

socket.on("sync-youtube-video", ({ videoId, timestamp }) => {
  clearMediaPlayer();
  youtubePlayer.style.display = "block";
  const delay = Date.now() - timestamp;
  youtubePlayer.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&start=${Math.floor(delay / 1000)}`;
});

function extractYoutubeVideoId(url) {
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// File Upload
uploadBtn.addEventListener("click", () => {
  const file = uploadInput.files[0];
  if (!file) {
    alert("Please select a file to upload.");
    return;
  }
  
  let fileType = file.type;
  if (!fileType) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['mp4', 'webm', 'ogg', 'mkv', 'mov'].includes(ext)) fileType = 'video/' + ext;
    else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) fileType = 'image/' + ext;
  }

  if (!fileType || !(fileType.startsWith("video") || fileType.startsWith("image"))) {
    alert("Please upload a valid video or image file.");
    return;
  }

  const formData = new FormData();
  formData.append("video", file);

  uploadBtn.textContent = "Uploading...";
  uploadBtn.disabled = true;

  fetch("/upload", {
    method: "POST",
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      socket.emit("media-uploaded", { dataUrl: data.path, type: fileType });
      replaceIframeWithMedia(data.path, fileType);
    } else {
      alert("Upload failed.");
    }
  })
  .catch(err => {
    console.error("Upload error:", err);
    alert("Error uploading media.");
  })
  .finally(() => {
    uploadBtn.textContent = "Upload";
    uploadBtn.disabled = false;
  });
});

socket.on("media-uploaded", ({ dataUrl, type }) => {
  replaceIframeWithMedia(dataUrl, type);
});

function replaceIframeWithMedia(dataUrl, type) {
  clearMediaPlayer();
  youtubePlayer.style.display = "none";
  youtubePlayer.src = "";

  let element;
  if (type.startsWith("video")) {
    element = document.createElement("video");
    element.controls = true;
    element.autoplay = true;
    element.muted = true;         
    element.playsInline = true;
    element.onloadeddata = () => element.play().catch(() => {});
  } else if (type.startsWith("image")) {
    element = document.createElement("img");
  }

  if (element) {
    element.src = dataUrl;
    mediaPlayerContainer.appendChild(element);
  }
}

// ==========================
// 8. Draggable Video Container
// ==========================
const dragHandle = document.getElementById("drag-handle");
const videoCallWrapper = document.getElementById("video-call-wrapper");

let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 0;
let yOffset = 0;

dragHandle.addEventListener("mousedown", dragStart);
document.addEventListener("mouseup", dragEnd);
document.addEventListener("mousemove", drag);

function dragStart(e) {
  if (e.target.closest('.call-controls')) return;

  initialX = e.clientX - xOffset;
  initialY = e.clientY - yOffset;
  if (e.target === dragHandle || dragHandle.contains(e.target)) {
    isDragging = true;
    if (videoCallWrapper.style.position !== 'absolute') {
        const rect = videoCallWrapper.getBoundingClientRect();
        videoCallWrapper.style.position = 'absolute';
        videoCallWrapper.style.top = rect.top + 'px';
        videoCallWrapper.style.left = rect.left + 'px';
        videoCallWrapper.style.width = rect.width + 'px';
        videoCallWrapper.style.zIndex = 1000;
        
        xOffset = 0;
        yOffset = 0;
        initialX = e.clientX;
        initialY = e.clientY;
        videoCallWrapper.style.transform = `translate3d(0px, 0px, 0)`;
    }
  }
}

function dragEnd(e) {
  initialX = currentX;
  initialY = currentY;
  isDragging = false;
}

function drag(e) {
  if (isDragging) {
    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    xOffset = currentX;
    yOffset = currentY;
    setTranslate(currentX, currentY, videoCallWrapper);
  }
}

function setTranslate(xPos, yPos, el) {
  el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
}
