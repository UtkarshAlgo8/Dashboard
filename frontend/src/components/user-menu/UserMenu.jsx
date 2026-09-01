import { useEffect, useState } from "react";
import {
  Avatar,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  useTheme,
} from "@mui/material";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import HelpIcon from "@mui/icons-material/Help";
import SupportIcon from "@mui/icons-material/Support";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import { useNavigate } from "react-router-dom";
import HelpModal from "./HelpModal.jsx";
import AboutModal from "./AboutModal.jsx";
import { useAuth } from "@/hooks/useAuth.js";

/**
 * Avatar + dropdown menu matching Adobe XD design with options:
 * 1. Guides & Manuals
 * 2. Support
 * 3. Exit Fullscreen / Fullscreen
 * 4. Sign Out
 */
function UserMenu({ size = 32 }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [anchorEl, setAnchorEl] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== "undefined" && Boolean(document.fullscreenElement),
  );
  const open = Boolean(anchorEl);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const openModal = (id) => {
    setActiveModal(id);
    handleClose();
  };

  const handleToggleFullscreen = () => {
    handleClose();
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const handleSignOut = async () => {
    handleClose();
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <>
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.5}
        onClick={handleOpen}
        sx={{ cursor: "pointer" }}
      >
        <Avatar
          sx={{
            width: size,
            height: size,
            backgroundColor: "text.primary",
            color: "background.paper",
            cursor: "pointer",
            transition: "opacity 0.15s ease",
            "&:hover": { opacity: 0.85 },
          }}
        >
          <PersonOutlineIcon sx={{ fontSize: size * 0.65 }} />
        </Avatar>
        <KeyboardArrowDownIcon sx={{ fontSize: 16, color: "text.secondary" }} />
      </Stack>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 210,
              borderRadius: 3,
              boxShadow: theme.custom.shadow,
              border: 1,
              borderColor: "rgba(0,0,0,0.06)",
              py: 0.75,
              px: 0.5,
            },
          },
        }}
      >
        {/* 1. Guides & Manuals */}
        <MenuItem
          onClick={() => openModal("help")}
          sx={{
            borderRadius: 2,
            py: 1,
            px: 1.5,
            my: 0.25,
            gap: 1.25,
            "&:hover": { backgroundColor: theme.custom.surface.soft },
          }}
        >
          <ListItemIcon sx={{ minWidth: "auto", color: "text.primary" }}>
            <HelpIcon sx={{ fontSize: 20 }} />
          </ListItemIcon>
          <ListItemText
            primary="Guides & Manuals"
            primaryTypographyProps={{
              fontSize: 14.5,
              fontWeight: 500,
              color: "text.primary",
            }}
          />
        </MenuItem>

        {/* 2. Support */}
        <MenuItem
          onClick={() => openModal("about")}
          sx={{
            borderRadius: 2,
            py: 1,
            px: 1.5,
            my: 0.25,
            gap: 1.25,
            "&:hover": { backgroundColor: theme.custom.surface.soft },
          }}
        >
          <ListItemIcon sx={{ minWidth: "auto", color: "text.primary" }}>
            <SupportIcon sx={{ fontSize: 20 }} />
          </ListItemIcon>
          <ListItemText
            primary="Support"
            primaryTypographyProps={{
              fontSize: 14.5,
              fontWeight: 500,
              color: "text.primary",
            }}
          />
        </MenuItem>

        {/* 3. Exit Fullscreen / Fullscreen */}
        <MenuItem
          onClick={handleToggleFullscreen}
          sx={{
            borderRadius: 2,
            py: 1,
            px: 1.5,
            my: 0.25,
            gap: 1.25,
            "&:hover": { backgroundColor: theme.custom.surface.soft },
          }}
        >
          <ListItemIcon sx={{ minWidth: "auto", color: "text.primary" }}>
            {isFullscreen ? (
              <FullscreenExitIcon sx={{ fontSize: 20 }} />
            ) : (
              <FullscreenExitIcon sx={{ fontSize: 20 }} />
            )}
          </ListItemIcon>
          <ListItemText
            primary={isFullscreen ? "Exit Fullscreen" : "Exit Fullscreen"}
            primaryTypographyProps={{
              fontSize: 14.5,
              fontWeight: 500,
              color: "text.primary",
            }}
          />
        </MenuItem>

        {/* 4. Sign Out */}
        <MenuItem
          onClick={handleSignOut}
          sx={{
            borderRadius: 2,
            py: 1,
            px: 1.5,
            my: 0.25,
            gap: 1.25,
            "&:hover": { backgroundColor: theme.custom.surface.soft },
          }}
        >
          <ListItemIcon sx={{ minWidth: "auto", color: "text.primary" }}>
            <ExitToAppIcon sx={{ fontSize: 20 }} />
          </ListItemIcon>
          <ListItemText
            primary="Sign Out"
            primaryTypographyProps={{
              fontSize: 14.5,
              fontWeight: 500,
              color: "text.primary",
            }}
          />
        </MenuItem>
      </Menu>

      <HelpModal
        open={activeModal === "help"}
        onClose={() => setActiveModal(null)}
      />
      <AboutModal
        open={activeModal === "about"}
        onClose={() => setActiveModal(null)}
      />
    </>
  );
}

export default UserMenu;
