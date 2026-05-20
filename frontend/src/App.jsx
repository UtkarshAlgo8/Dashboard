import { CssBaseline, ThemeProvider } from "@mui/material";
import { RouterProvider } from "react-router-dom";
import { PrintStyles, ToastProvider } from "@/components/common";
import theme from "@/theme.js";
import router from "@/router.jsx";

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <PrintStyles />
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
