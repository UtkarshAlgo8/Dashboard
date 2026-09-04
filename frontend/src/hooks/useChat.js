import { useContext } from "react";
import { ChatContext } from "@/contexts/ChatContext.jsx";

/**
 * Hook to consume the JK Agent chat context.
 *
 * @returns {import("@/contexts/ChatContext.jsx").ChatContextValue}
 */
export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return ctx;
}
