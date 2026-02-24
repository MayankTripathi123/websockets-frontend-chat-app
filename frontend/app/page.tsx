'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

import {
  API_URL,
  Message,
  Room,
  createRoom,
  getRooms,
  refreshAccessToken,
  signIn,
  signUp,
} from '../lib/api';

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ??
  'https://bdhwx8m9-3002.inc1.devtunnels.ms';
const DEFAULT_AVATAR =
  'https://api.dicebear.com/7.x/identicon/svg?seed=next-chat';
const DEFAULT_ROOM_AVATAR =
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=600&q=60';

const parseAccessToken = (token: string | null): string | null => {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(atob(payload));
    return decoded?.id ?? null;
  } catch (err) {
    return null;
  }
};

type AuthMode = 'login' | 'register';

export default function Home() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomDesc, setRoomDesc] = useState('');
  const [roomAvatar, setRoomAvatar] = useState(DEFAULT_ROOM_AVATAR);
  const [status, setStatus] = useState<string>('Ready');
  const [authError, setAuthError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('accessToken');
    if (stored) {
      setAccessToken(stored);
      setUserId(parseAccessToken(stored));
    }
  }, []);

  const loadRooms = useCallback(async () => {
    if (!accessToken) return;
    setLoadingRooms(true);
    try {
      const list = await getRooms(accessToken);
      setRooms(list);
      setStatus(`Loaded ${list.length} rooms`);
    } catch (err) {
      setStatus(
        err instanceof Error ? err.message : 'Unable to fetch rooms right now',
      );
    } finally {
      setLoadingRooms(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    loadRooms();
  }, [accessToken, loadRooms]);

  useEffect(() => {
    if (!selectedRoom || !accessToken) return;

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      query: { token: accessToken },
    });

    socket.on('connect', () => {
      setStatus(`Connected to ${selectedRoom.name}`);
      socket.emit('join', { roomId: selectedRoom.id });
    });

    socket.on('disconnect', () => {
      setStatus('Socket disconnected');
    });

    socket.on('message', (payload: unknown) => {
      if (Array.isArray(payload)) {
        const normalized = payload.map((msg: any) => ({
          id: msg.id ?? crypto.randomUUID(),
          text: msg.text ?? '',
          created_at: msg.created_at,
          userId: msg.user?.id ?? msg.userId,
        }));
        setMessages(normalized);
        return;
      }

      if (typeof payload === 'string') {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            text: payload,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    });

    socket.on('kicked', (reason: string) => {
      setStatus(`Kicked: ${reason}`);
      setSelectedRoom(null);
      setMessages([]);
    });

    socket.on('banned', (reason: string) => {
      setStatus(`Banned: ${reason}`);
      setSelectedRoom(null);
      setMessages([]);
    });

    socketRef.current = socket;

    return () => {
      socket.emit('leave', { roomId: selectedRoom.id });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [selectedRoom, accessToken]);

  const handleAuth = async () => {
    setAuthError(null);
    try {
      const tokens =
        mode === 'login'
          ? await signIn(username, password)
          : await signUp(username, password, avatar, isAdmin);

      setAccessToken(tokens.accessToken);
      setUserId(parseAccessToken(tokens.accessToken));
      localStorage.setItem('accessToken', tokens.accessToken);
      setStatus('Authenticated');
      await loadRooms();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in');
    }
  };

  const handleLogout = () => {
    setAccessToken(null);
    setUserId(null);
    localStorage.removeItem('accessToken');
    setSelectedRoom(null);
    setMessages([]);
    setStatus('Logged out');
  };

  const handleRefresh = async () => {
    const token = await refreshAccessToken();
    if (token) {
      setAccessToken(token);
      setUserId(parseAccessToken(token));
      setStatus('Access token refreshed');
    } else {
      setStatus('Refresh failed - sign in again');
    }
  };

  const handleCreateRoom = async () => {
    if (!accessToken) return;
    if (!roomName.trim() || !roomDesc.trim()) return;

    try {
      const room = await createRoom(accessToken, {
        name: roomName.trim(),
        description: roomDesc.trim(),
        avatar: roomAvatar.trim() || DEFAULT_ROOM_AVATAR,
      });
      setRooms((prev) => [room, ...prev]);
      setRoomName('');
      setRoomDesc('');
      setStatus(`Room "${room.name}" created`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Room creation failed');
    }
  };

  const handleSend = () => {
    if (!socketRef.current || !chatInput.trim() || !selectedRoom) return;

    const text = chatInput.trim();
    socketRef.current.emit('message', { text, userId });
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, text, created_at: new Date().toISOString() },
    ]);
    setChatInput('');
  };

  return (
    <div className="shell">
      <div className="headline">
        <div>
          <div className="title">Realtime Chat (Next.js client)</div>
          <div className="status">
            API {API_URL} · WebSocket {SOCKET_URL}
          </div>
        </div>
        <div className="row">
          {accessToken && (
            <button className="btn btn-ghost" onClick={handleRefresh}>
              Refresh Token
            </button>
          )}
          {accessToken ? (
            <button className="btn btn-danger" onClick={handleLogout}>
              Logout
            </button>
          ) : null}
        </div>
      </div>

      <div className="card-split">
        <div className="stack">
          <div className="panel stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="badge">Auth</div>
              <div className="row">
                <button
                  className={`btn ${mode === 'login' ? 'btn-primary' : ''}`}
                  onClick={() => setMode('login')}
                >
                  Sign in
                </button>
                <button
                  className={`btn ${mode === 'register' ? 'btn-primary' : ''}`}
                  onClick={() => setMode('register')}
                >
                  Sign up
                </button>
              </div>
            </div>

            <input
              className="input"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              className="input"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {mode === 'register' && (
              <>
                <input
                  className="input"
                  placeholder="Avatar URL"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                />
                <label
                  className="row"
                  style={{ justifyContent: 'space-between' }}
                >
                  <span className="muted">Admin privileges</span>
                  <input
                    type="checkbox"
                    checked={isAdmin}
                    onChange={(e) => setIsAdmin(e.target.checked)}
                  />
                </label>
              </>
            )}

            <button className="btn btn-primary" onClick={handleAuth}>
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
            {authError && (
              <div className="status" style={{ color: '#f87171' }}>
                {authError}
              </div>
            )}
          </div>

          <div className="panel stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="badge">Rooms</div>
              <div className="row">
                <button
                  className="btn btn-ghost"
                  onClick={loadRooms}
                  disabled={loadingRooms}
                >
                  {loadingRooms ? 'Loading…' : 'Reload'}
                </button>
              </div>
            </div>
            <div className="grid">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className={`room-card ${
                    selectedRoom?.id === room.id ? 'active' : ''
                  }`}
                  onClick={() => {
                    setSelectedRoom(room);
                    setMessages([]);
                  }}
                >
                  <div
                    className="row"
                    style={{ justifyContent: 'space-between' }}
                  >
                    <strong>{room.name}</strong>
                    <span className="pill">
                      {room.messages?.length ?? 0} msgs
                    </span>
                  </div>
                  <div className="muted">{room.description}</div>
                </div>
              ))}
              {!rooms.length && (
                <div className="muted">No rooms yet — create one below.</div>
              )}
            </div>
          </div>

          <div className="panel stack">
            <div className="badge">Create room</div>
            <input
              className="input"
              placeholder="Room name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />
            <input
              className="input"
              placeholder="Short description"
              value={roomDesc}
              onChange={(e) => setRoomDesc(e.target.value)}
            />
            <input
              className="input"
              placeholder="Avatar URL"
              value={roomAvatar}
              onChange={(e) => setRoomAvatar(e.target.value)}
            />
            <button
              className="btn btn-primary"
              onClick={handleCreateRoom}
              disabled={!accessToken}
            >
              Create
            </button>
          </div>
        </div>

        <div className="panel chat">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="badge">Chat</div>
              <div className="muted">
                {selectedRoom ? selectedRoom.name : 'Choose a room to start'}
              </div>
            </div>
            {selectedRoom && (
              <button
                className="btn btn-ghost"
                onClick={() => setSelectedRoom(null)}
              >
                Leave room
              </button>
            )}
          </div>

          <div className="messages">
            {messages.length === 0 && (
              <div className="muted">No messages yet.</div>
            )}
            {messages.map((msg) => (
              <div className="message" key={msg.id}>
                <div>{msg.text}</div>
                {msg.created_at && (
                  <div className="muted">
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="row">
            <input
              className="input"
              placeholder={
                selectedRoom ? 'Type a message…' : 'Pick a room to chat'
              }
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={!selectedRoom}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
            />
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={!selectedRoom || !chatInput.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      <div className="status">{status}</div>
    </div>
  );
}
