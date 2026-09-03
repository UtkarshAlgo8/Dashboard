import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { sendChatMessage } from "@/api/chat.js";
import { useAuth } from "@/hooks/useAuth.js";

const SESSION_KEY = "jkdash.chatSession";
const MESSAGES_KEY_PREFIX = "jk_agent_chat_";
// "1-2 days or more" per spec — 48h is the refresh floor; logging out
// always clears the session outright regardless of this TTL.
const SESSION_TTL_MS = 48 * 60 * 60 * 1000;

const ChatContext = createContext(null);
export { ChatContext };

function readJson(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    if (value === null || value === undefined) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, JSON.stringify(value));
    }
  } catch {
    /* storage unavailable or quota exceeded — no-op */
  }
}

function generateSessionId(userId) {
  let rand;
  try {
    const bytes = new Uint32Array(4);
    window.crypto.getRandomValues(bytes);
    rand = Array.from(bytes, (n) => n.toString(36)).join("");
  } catch {
    rand = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  }
  return `${userId ?? "anon"}-${Date.now()}-${rand}`;
}

/**
 * Reuses the stored session for `userId` if it is still fresh, otherwise
 * mints and persists a new one. Called once per login (including a
 * cold-reload bootstrap that restores an existing token) — logout always
 * clears the stored session first, so a fresh login never reuses a
 * previous one.
 *
 * @returns {{ sessionId: string, isFresh: boolean }}
 */
function deriveSession(userId) {
  const stored = readJson(window.localStorage, SESSION_KEY);
  if (
    stored &&
    stored.userId === userId &&
    typeof stored.createdAt === "number" &&
    Date.now() - stored.createdAt < SESSION_TTL_MS
  ) {
    return { sessionId: stored.sessionId, isFresh: false };
  }

  const sessionId = generateSessionId(userId);
  writeJson(window.localStorage, SESSION_KEY, {
    sessionId,
    userId,
    createdAt: Date.now(),
  });
  return { sessionId, isFresh: true };
}

function clearStoredSession() {
  writeJson(window.localStorage, SESSION_KEY, null);
}

function readStoredMessages(sessionId) {
  if (!sessionId) return [];
  const parsed = readJson(window.localStorage, MESSAGES_KEY_PREFIX + sessionId);
  if (!parsed || !Array.isArray(parsed.messages) || !parsed.savedAt) return [];
  if (Date.now() - parsed.savedAt > SESSION_TTL_MS) {
    writeJson(window.localStorage, MESSAGES_KEY_PREFIX + sessionId, null);
    return [];
  }
  return parsed.messages;
}

function writeStoredMessages(sessionId, messages) {
  if (!sessionId) return;
  const key = MESSAGES_KEY_PREFIX + sessionId;
  if (!messages || messages.length === 0) {
    writeJson(window.localStorage, key, null);
    return;
  }
  writeJson(window.localStorage, key, { savedAt: Date.now(), messages });
}

/**
 * Provides global state and actions for the JK Agent chatbot interface.
 *
 * @param {{ children: import("react").ReactNode }} props
 */
export function ChatProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.userId ?? null;

  const [sessionId, setSessionId] = useState(() =>
    isAuthenticated && userId ? deriveSession(userId).sessionId : null,
  );
  const [messages, setMessages] = useState(() =>
    isAuthenticated && userId ? readStoredMessages(sessionId) : [],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);

  // Re-derive the session synchronously during render whenever the login
  // identity changes (login, logout, or switching users) — the documented
  // React pattern for state that must track a prop/context change without
  // a render-then-effect-then-render waterfall. `authKey` is null while
  // logged out, so logout always clears the stored session and the next
  // login (even by the same user) mints a fresh one.
  const authKey = isAuthenticated && userId ? userId : null;
  const [trackedAuthKey, setTrackedAuthKey] = useState(authKey);
  if (authKey !== trackedAuthKey) {
    setTrackedAuthKey(authKey);
    if (authKey) {
      const { sessionId: nextId, isFresh } = deriveSession(authKey);
      setSessionId(nextId);
      setMessages(isFresh ? [] : readStoredMessages(nextId));
    } else {
      clearStoredSession();
      writeStoredMessages(sessionId, []); // drop the outgoing session's transcript
      setSessionId(null);
      setMessages([]);
    }
  }

  // Sync the visible transcript to storage on update.
  useEffect(() => {
    writeStoredMessages(sessionId, messages);
  }, [sessionId, messages]);

  const openChat = useCallback(() => {
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const closeChat = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleChat = useCallback(() => {
    setIsOpen((prev) => !prev);
    setIsMinimized(false);
  }, []);

  const minimizeChat = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const restoreChat = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    writeStoredMessages(sessionId, []);
  }, [sessionId]);

  const sendMessage = useCallback(
    async (text) => {
      const cleanText = text?.trim();
      if (!cleanText || isTyping || !sessionId) return;

      const userMessage = {
        id: `user-${Date.now()}`,
        sender: "user",
        text: cleanText,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsTyping(true);
      setError(null);

      try {
        const response = await sendChatMessage({
          query: cleanText,
          session_id: sessionId,
        });

        const agentMessage = {
          id: `agent-${Date.now()}`,
          sender: "agent",
          text:
            response.final_answer ??
            response.execution_error ??
            "I couldn't generate a response for that.",
          timestamp: new Date().toISOString(),
          isError: Boolean(response.execution_error),
          resultId: response.result_id ?? null,
          downloadAvailable: Boolean(
            response.is_large_result && response.download_available,
          ),
          columns: response.columns ?? null,
          wantsPlot: Boolean(response.wants_plot && response.plot_spec),
          plotSpec: response.plot_spec ?? null,
          previewRows: response.preview_rows ?? null,
        };

        setMessages((prev) => [...prev, agentMessage]);
      } catch (err) {
        setError(err?.message || "Failed to get response from JK Agent");
        const errorMessage = {
          id: `err-${Date.now()}`,
          sender: "agent",
          text: "I encountered an error connecting to the intelligence service. Please try again.",
          timestamp: new Date().toISOString(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsTyping(false);
      }
    },
    [isTyping, sessionId],
  );

  const value = useMemo(
    () => ({
      isOpen,
      isMinimized,
      isExpanded,
      messages,
      isTyping,
      error,
      sessionId,
      openChat,
      closeChat,
      toggleChat,
      minimizeChat,
      restoreChat,
      toggleExpand,
      clearChat,
      sendMessage,
    }),
    [
      isOpen,
      isMinimized,
      isExpanded,
      messages,
      isTyping,
      error,
      sessionId,
      openChat,
      closeChat,
      toggleChat,
      minimizeChat,
      restoreChat,
      toggleExpand,
      clearChat,
      sendMessage,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export default ChatProvider;
