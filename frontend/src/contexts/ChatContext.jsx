import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { sendChatMessage } from "@/api/chat.js";

const STORAGE_KEY = "jk_agent_chat_session";
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

const ChatContext = createContext(null);
export { ChatContext };

function readStoredSession() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.messages) || !parsed.savedAt) {
      return null;
    }
    const age = Date.now() - parsed.savedAt;
    if (age > TWO_HOURS_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.messages;
  } catch {
    return null;
  }
}

function writeStoredSession(messages) {
  try {
    if (!messages || messages.length === 0) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload = {
      savedAt: Date.now(),
      messages,
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* sessionStorage unavailable or quota exceeded — no-op */
  }
}

/**
 * Provides global state and actions for the JK Agent chatbot interface.
 *
 * @param {{ children: import("react").ReactNode }} props
 */
export function ChatProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState(() => readStoredSession() ?? []);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);

  // Sync to sessionStorage on update
  useEffect(() => {
    writeStoredSession(messages);
  }, [messages]);

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
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const sendMessage = useCallback(
    async (text, context = {}) => {
      const cleanText = text?.trim();
      if (!cleanText || isTyping) return;

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
        const history = messages.map((m) => ({
          sender: m.sender,
          text: m.text,
        }));

        const response = await sendChatMessage({
          message: cleanText,
          context,
          history,
        });

        const agentMessage = {
          id: `agent-${Date.now()}`,
          sender: "agent",
          text: response.reply,
          timestamp: response.timestamp || new Date().toISOString(),
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
    [isTyping, messages],
  );

  const value = useMemo(
    () => ({
      isOpen,
      isMinimized,
      isExpanded,
      messages,
      isTyping,
      error,
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
