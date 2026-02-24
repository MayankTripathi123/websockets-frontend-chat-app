export type Tokens = {
  accessToken: string;
  refreshToken?: string;
};

export type Room = {
  id: string;
  name: string;
  description: string;
  avatar: string;
  ownerId: string;
  messages?: Array<Message>;
};

export type Message = {
  id?: string;
  text: string;
  created_at?: string;
  roomId?: string;
  userId?: string;
  user?: { id: string; username: string };
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'https://bdhwx8m9-3002.inc1.devtunnels.ms';

async function request<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && retry) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      return request<T>(path, options, refreshedToken, false);
    }
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || response.statusText);
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

export async function signIn(username: string, password: string) {
  return request<Tokens>(
    '/auth/signIn',
    {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    },
    undefined,
    false,
  );
}

export async function signUp(
  username: string,
  password: string,
  avatar: string,
  isAdmin: boolean,
) {
  return request<Tokens>(
    '/auth/signUp',
    {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
        avatar,
        is_admin: isAdmin,
      }),
    },
    undefined,
    false,
  );
}

export async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/auth/update`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) return null;

    const tokenText = await response.text();
    const token = tokenText.replace(/"/g, ''); // Nest can stringify bare strings

    if (token) {
      localStorage.setItem('accessToken', token);
    }

    return token;
  } catch (err) {
    return null;
  }
}

export async function getRooms(accessToken?: string) {
  return request<Room[]>('/room', { method: 'GET' }, accessToken);
}

export async function createRoom(
  accessToken: string,
  data: { name: string; description: string; avatar: string },
) {
  return request<Room>(
    '/room',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    accessToken,
  );
}

export { API_URL };
