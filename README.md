# WatchParty

A synchronized YouTube watch-party platform that lets friends watch videos together in real time, no matter where they are — complete with video calling and live chat.

**Live Demo:** [watchers-watchparty-web-application.onrender.com](https://watchers-watchparty-web-application.onrender.com/)

## Features

- **Synchronized video playback** — play, pause, and seek events sync across all users in the room instantly
- **Real-time video calling** — see and talk to everyone in the room while watching
- **Live chat/messaging** — text chat alongside the video for reactions and discussion
- **Responsive UI** — works smoothly across different screen sizes

## Tech Stack

**Frontend:** React
**Backend:** Node.js
**Real-time Communication:** Socket.IO

## How It Works

1. A user creates a watch-party room and shares the room link with friends
2. Everyone who joins connects via Socket.IO, keeping video playback state (play/pause/seek) synchronized across all clients
3. Video calling and chat run alongside the synced player so the group can react and talk in real time

## Getting Started

### Prerequisites
- Node.js installed on your machine

### Installation

```bash
# Clone the repository
git clone https://github.com/regno001/watchers.git
cd watchers

# Install dependencies (adjust paths below to match your folder structure,
# e.g. separate /client and /server directories)
npm install
```

### Running Locally

```bash
# Start the backend server
npm run server

# In a separate terminal, start the frontend
npm run client
```

> Note: Update the commands above to match your actual npm scripts / folder structure (e.g. if client and server are in separate directories, `cd` into each and run `npm start` there).

## Author

**Rahul Rawat**
- Portfolio: [rahulrawat.netlify.app](http://rahulrawat.netlify.app)
- LinkedIn: [rahul-rawat-992863321](https://linkedin.com/in/rahul-rawat-992863321)
- GitHub: [@regno001](https://github.com/regno001)

## License

This project is open source and available for learning and reference purposes.
