import { CssBaseline, ThemeProvider } from "@mui/material";
import { RouterProvider } from "react-router-dom";

import { PrintStyles, ToastProvider } from "@/components/common";
import theme from "@/theme.js";
import router from "@/router.jsx";
import { AuthProvider } from "@/contexts/AuthContext.jsx";
import ChatProvider from "@/contexts/ChatContext.jsx";

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <PrintStyles />
      <AuthProvider>
        <ToastProvider>
          <ChatProvider>
            <RouterProvider router={router} />
          </ChatProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
