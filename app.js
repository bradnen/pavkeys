import React, { useState, useEffect, useRef } from "react";
import { ref, set, onValue, push, remove } from "firebase/database";
import { database } from "./firebase";

const sampleText = "The quick brown fox jumps over the lazy dog.";

function App() {
  const [roomId, setRoomId] = useState("");
  const [joinedRoom, setJoinedRoom] = useState(false);
  const [players, setPlayers] = useState({});
  const [myId, setMyId] = useState(null);
  const [typed, setTyped] = useState("");
  const [raceStarted, setRaceStarted] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [finished, setFinished] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const typingRef = useRef();

  // Create or join room
  function createRoom() {
    const newRoomId = Math.random().toString(36).substring(2, 7);
    setRoomId(newRoomId);
    setJoinedRoom(true);
    const playerId = push(ref(database, `rooms/${newRoomId}/players`)).key;
    setMyId(playerId);
    set(ref(database, `rooms/${newRoomId}/players/${playerId}`), {
      progress: 0,
      accuracy: 100,
      typed: "",
      finished: false,
      wpm: 0,
    });
  }

  function joinRoom() {
    if (!roomId) return alert("Enter a room ID");
    const playerId = push(ref(database, `rooms/${roomId}/players`)).key;
    setMyId(playerId);
    setJoinedRoom(true);
    set(ref(database, `rooms/${roomId}/players/${playerId}`), {
      progress: 0,
      accuracy: 100,
      typed: "",
      finished: false,
      wpm: 0,
    });
  }

  // Listen to players
  useEffect(() => {
    if (!roomId) return;
    const playersRef = ref(database, `rooms/${roomId}/players`);
    const unsubscribe = onValue(playersRef, (snapshot) => {
      setPlayers(snapshot.val() || {});
    });
    return () => unsubscribe();
  }, [roomId]);

  // Start countdown and race
  useEffect(() => {
    if (!joinedRoom) return;

    setCountdown(3);
    setRaceStarted(false);
    setTyped("");
    setFinished(false);

    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c === 1) {
          clearInterval(interval);
          setRaceStarted(true);
          setStartTime(Date.now());
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    // Cleanup players on unmount/leave
    return () => {
      if (myId && roomId) {
        remove(ref(database, `rooms/${roomId}/players/${myId}`));
      }
    };
  }, [joinedRoom]);

  // Calculate WPM helper
  function calculateWPM(charsTyped, msElapsed) {
    return ((charsTyped / 5) * (60000 / msElapsed)) || 0;
  }

  // On typing input
  function onType(e) {
    if (!raceStarted || finished) return;
    const value = e.target.value;
    if (value.length > sampleText.length) return; // don't allow extra chars
    setTyped(value);

    let correctChars = 0;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === sampleText[i]) correctChars++;
    }
    const accuracy = value.length ? (correctChars / value.length) * 100 : 100;
    const progress = value.length / sampleText.length;

    const elapsed = Date.now() - startTime;
    const wpm = calculateWPM(value.length, elapsed);

    if (myId) {
      set(
        ref(database, `rooms/${roomId}/players/${myId}`),
        {
          typed: value,
          accuracy,
          progress,
          finished: value.length === sampleText.length,
          wpm,
        }
      );
    }

    if (value.length === sampleText.length) {
      setFinished(true);
    }
  }

  // Render text with coloring for typed chars
  function renderText() {
    const typedChars = typed.split("");
    return sampleText.split("").map((char, i) => {
      let color = "#444";
      if (i < typedChars.length) {
        color = typedChars[i] === char ? "green" : "red";
      }
      return (
        <span key={i} style={{ color }}>
          {char}
        </span>
      );
    });
  }

  // Leaderboard sorted by WPM descending
  const leaderboard = Object.entries(players)
    .filter(([, p]) => p.finished)
    .sort((a, b) => b[1].wpm - a[1].wpm);

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif", maxWidth: 700 }}>
      {!joinedRoom ? (
        <div>
          <h2>Create or Join a Room</h2>
          <button onClick={createRoom}>Create Room</button>
          <div style={{ marginTop: 10 }}>
            <input
              placeholder="Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.trim())}
            />
            <button onClick={joinRoom}>Join Room</button>
          </div>
          <p style={{ marginTop: 20 }}>
            Share the room ID with friends to race!
          </p>
        </div>
      ) : (
        <div>
          <h2>Room ID: {roomId}</h2>

          {!raceStarted ? (
            <h3>Race starts in: {countdown}</h3>
          ) : finished ? (
            <>
              <h3>Race Finished!</h3>
              <h4>Leaderboard:</h4>
              <ol>
                {leaderboard.map(([id, p], idx) => (
                  <li key={id}>
                    Player {id === myId ? "(You)" : id.slice(0, 5)} - WPM:{" "}
                    {p.wpm.toFixed(1)}, Accuracy: {p.accuracy.toFixed(1)}%
                  </li>
                ))}
              </ol>
              <button
                onClick={() => {
                  setJoinedRoom(false);
                  setRoomId("");
                  setPlayers({});
                  setTyped("");
                  setRaceStarted(false);
                  setFinished(false);
                  setMyId(null);
                }}
              >
                Leave Room
              </button>
            </>
          ) : (
            <>
              <p
                style={{
                  background: "#eee",
                  padding: 10,
                  fontSize: 18,
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                  userSelect: "none",
                }}
              >
                {renderText()}
              </p>

              <textarea
                ref={typingRef}
                rows={3}
                cols={60}
                value={typed}
                onChange={onType}
                placeholder="Start typing when the race starts..."
                spellCheck={false}
                style={{ fontSize: 18 }}
                disabled={!raceStarted || finished}
                autoFocus={raceStarted && !finished}
              />

              <h3>Players progress:</h3>
              <ul>
                {Object.entries(players).map(([id, player]) => (
                  <li key={id}>
                    Player {id === myId ? "(You)" : id.slice(0, 5)} -{" "}
                    {(player.progress * 100).toFixed(1)}% typed, Accuracy:{" "}
                    {player.accuracy.toFixed(1)}%, WPM: {player.wpm.toFixed(1)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
