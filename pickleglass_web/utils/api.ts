export interface UserProfile {
  uid: string;
  display_name: string;
  email: string;
}

export interface Session {
  id: string;
  uid: string;
  title: string;
  session_type: string;
  started_at: number;
  ended_at?: number;
  sync_state: 'clean' | 'dirty';
  updated_at: number;
}

export interface Transcript {
  id: string;
  session_id: string;
  start_at: number;
  end_at?: number;
  speaker?: string;
  text: string;
  lang?: string;
  created_at: number;
  sync_state: 'clean' | 'dirty';
}

export interface AiMessage {
  id: string;
  session_id: string;
  sent_at: number;
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
  model?: string;
  created_at: number;
  sync_state: 'clean' | 'dirty';
}

export interface Summary {
  session_id: string;
  generated_at: number;
  model?: string;
  text: string;
  tldr: string;
  bullet_json: string;
  action_json: string;
  tokens_used?: number;
  updated_at: number;
  sync_state: 'clean' | 'dirty';
}

export interface PromptPreset {
  id: string;
  uid: string;
  title: string;
  prompt: string;
  is_default: 0 | 1;
  created_at: number;
  sync_state: 'clean' | 'dirty';
}

export interface SessionDetails {
    session: Session;
    transcripts: Transcript[];
    ai_messages: AiMessage[];
    summary: Summary | null;
}


let API_ORIGIN = process.env.NODE_ENV === 'development'
  ? 'http://localhost:9001'
  : '';

const loadRuntimeConfig = async (): Promise<string | null> => {
  try {
    const response = await fetch('/runtime-config.json');
    if (response.ok) {
      const config = await response.json();
      console.log('✅ Runtime config loaded:', config);
      return config.API_URL;
    }
  } catch (error) {
    console.log('⚠️ Failed to load runtime config:', error);
  }
  return null;
};

let apiUrlInitialized = false;
let initializationPromise: Promise<void> | null = null;

const initializeApiUrl = async () => {
  if (apiUrlInitialized) return;
  
  // Electron IPC 관련 코드를 모두 제거하고 runtime-config.json 또는 fallback에만 의존합니다.
  const runtimeUrl = await loadRuntimeConfig();
  if (runtimeUrl) {
    API_ORIGIN = runtimeUrl;
    apiUrlInitialized = true;
    return;
  }

  console.log('📍 Using fallback API URL:', API_ORIGIN);
  apiUrlInitialized = true;
};

if (typeof window !== 'undefined') {
  initializationPromise = initializeApiUrl();
}

const userInfoListeners: Array<(userInfo: UserProfile | null) => void> = [];

export const getUserInfo = (): UserProfile | null => {
  if (typeof window === 'undefined') return null;
  
  const storedUserInfo = localStorage.getItem('pickleglass_user');
  if (storedUserInfo) {
    try {
      return JSON.parse(storedUserInfo);
    } catch (error) {
      console.error('Failed to parse user info:', error);
      localStorage.removeItem('pickleglass_user');
    }
  }
  return null;
};

export const setUserInfo = (userInfo: UserProfile | null, skipEvents: boolean = false) => {
  if (typeof window === 'undefined') return;
  
  if (userInfo) {
    localStorage.setItem('pickleglass_user', JSON.stringify(userInfo));
  } else {
    localStorage.removeItem('pickleglass_user');
  }
  
  if (!skipEvents) {
    userInfoListeners.forEach(listener => listener(userInfo));
    
    window.dispatchEvent(new Event('userInfoChanged'));
  }
};

export const onUserInfoChange = (listener: (userInfo: UserProfile | null) => void) => {
  userInfoListeners.push(listener);
  
  return () => {
    const index = userInfoListeners.indexOf(listener);
    if (index > -1) {
      userInfoListeners.splice(index, 1);
    }
  };
};

export const getApiHeaders = (): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  const userInfo = getUserInfo();
  if (userInfo?.uid) {
    headers['X-User-ID'] = userInfo.uid;
  }
  
  return headers;
};


export const apiCall = async (path: string, options: RequestInit = {}) => {
  if (!apiUrlInitialized && initializationPromise) {
    await initializationPromise;
  }
  
  if (!apiUrlInitialized) {
    await initializeApiUrl();
  }
  
  const url = `${API_ORIGIN}${path}`;
  console.log('🌐 apiCall (Local Mode):', {
    path,
    API_ORIGIN,
    fullUrl: url,
    initialized: apiUrlInitialized,
    timestamp: new Date().toISOString()
  });
  
  const defaultOpts: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...getApiHeaders(),
      ...(options.headers || {}),
    },
    ...options,
  };
  return fetch(url, defaultOpts);
};


export const searchConversations = async (query: string): Promise<Session[]> => {
  if (!query.trim()) {
    return [];
  }

  const response = await apiCall(`/api/conversations/search?q=${encodeURIComponent(query)}`, {
    method: 'GET',
  });
  if (!response.ok) {
    throw new Error('Failed to search conversations');
  }
  return response.json();
};

export const getSessions = async (): Promise<Session[]> => {
  const response = await apiCall(`/api/conversations`, { method: 'GET' });
  if (!response.ok) throw new Error('Failed to fetch sessions');
  return response.json();
};

export const getSessionDetails = async (sessionId: string): Promise<SessionDetails> => {
  const response = await apiCall(`/api/conversations/${sessionId}`, { method: 'GET' });
  if (!response.ok) throw new Error('Failed to fetch session details');
  return response.json();
};

export const createSession = async (title?: string): Promise<{ id: string }> => {
  const response = await apiCall(`/api/conversations`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
  if (!response.ok) throw new Error('Failed to create session');
  return response.json();
};

export const deleteSession = async (sessionId: string): Promise<void> => {
  const response = await apiCall(`/api/conversations/${sessionId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete session');
};

export const getUserProfile = async (): Promise<UserProfile> => {
  const response = await apiCall(`/api/user/profile`, { method: 'GET' });
  if (!response.ok) throw new Error('Failed to fetch user profile');
  return response.json();
};

export const updateUserProfile = async (data: { displayName: string }): Promise<void> => {
  const response = await apiCall(`/api/user/profile`, {
      method: 'PUT',
      body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update user profile');
};

export const findOrCreateUser = async (user: UserProfile): Promise<UserProfile> => {
  const response = await apiCall(`/api/user/find-or-create`, {
      method: 'POST',
      body: JSON.stringify(user),
  });
  if (!response.ok) throw new Error('Failed to find or create user');
  return response.json();
};

export const saveApiKey = async (apiKey: string): Promise<void> => {
  const response = await apiCall(`/api/user/api-key`, {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
  });
  if (!response.ok) throw new Error('Failed to save API key');
};

export const checkApiKeyStatus = async (): Promise<{ hasApiKey: boolean }> => {
  const response = await apiCall(`/api/user/api-key-status`, { method: 'GET' });
  if (!response.ok) throw new Error('Failed to check API key status');
  return response.json();
};

export const deleteAccount = async (): Promise<void> => {
  const response = await apiCall(`/api/user/profile`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete account');
};

export const getPresets = async (): Promise<PromptPreset[]> => {
  const response = await apiCall(`/api/presets`, { method: 'GET' });
  if (!response.ok) throw new Error('Failed to fetch presets');
  return response.json();
};

export const createPreset = async (data: { title: string, prompt: string }): Promise<{ id: string }> => {
  const response = await apiCall(`/api/presets`, {
      method: 'POST',
      body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create preset');
  return response.json();
};

export const updatePreset = async (id: string, data: { title: string, prompt: string }): Promise<void> => {
  const response = await apiCall(`/api/presets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update preset: ${response.status} ${errorText}`);
  }
};

export const deletePreset = async (id: string): Promise<void> => {
  const response = await apiCall(`/api/presets/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete preset');
};

export interface BatchData {
    profile?: UserProfile;
    presets?: PromptPreset[];
    sessions?: Session[];
}

export const getBatchData = async (includes: ('profile' | 'presets' | 'sessions')[]): Promise<BatchData> => {
  const response = await apiCall(`/api/user/batch?include=${includes.join(',')}`, { method: 'GET' });
  if (!response.ok) throw new Error('Failed to fetch batch data');
  return response.json();
};

export const logout = async () => {
  
  setUserInfo(null);
  
  localStorage.removeItem('openai_api_key');
  localStorage.removeItem('user_info');
  
  window.location.href = '/login';
}; 