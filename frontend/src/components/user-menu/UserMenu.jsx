import { useState } from "react";
import {
  Avatar,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import { useNavigate } from "react-router-dom";
import ProfileModal from "./ProfileModal.jsx";
import ChangePasswordModal from "./ChangePasswordModal.jsx";
import ThemeModal from "./ThemeModal.jsx";
import HelpModal from "./HelpModal.jsx";
import AboutModal from "./AboutModal.jsx";

/**
 * Avatar + dropdown menu + 5 sub-modals per BRD §9.4 (FR-X18 –
 * FR-X25). Replaces the visual-only Avatar previously used in the
 * landing + production headers.
 *
 * Logout navigates to `/` per FR-X25; there's no auth token to
 * clear in Phase 1 (Q-AUTH-01).
 */
function UserMenu({ user, size = 36 }) {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const open = Boolean(anchorEl);

  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const openModal = (id) => {
    setActiveModal(id);
    handleClose();
  };

  const handleLogout = () => {
    handleClose();
    navigate("/");
  };

  return (
    <>
      <Avatar
        onClick={handleOpen}
        sx={{
          width: size,
          height: size,
          fontSize: size === 36 ? 13 : 12,
          fontWeight: 600,
          backgroundColor: "primary.main",
          color: "primary.contrastText",
          cursor: "pointer",
        }}
      >
        {user.avatarInitials}
      </Avatar>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{ paper: { sx: { minWidth: 200 } } }}
      >
        <MenuItem onClick={() => openModal("profile")}>
          <ListItemIcon>
            <PersonOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>My Profile</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => openModal("password")}>
          <ListItemIcon>
            <LockOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Change Password</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => openModal("theme")}>
          <ListItemIcon>
            <PaletteOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Theme</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => openModal("help")}>
          <ListItemIcon>
            <HelpOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Help</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => openModal("about")}>
          <ListItemIcon>
            <InfoOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>About</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout} sx={{ color: "error.main" }}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" sx={{ color: "error.main" }} />
          </ListItemIcon>
          <ListItemText>Logout</ListItemText>
        </MenuItem>
      </Menu>

      <ProfileModal
        open={activeModal === "profile"}
        onClose={() => setActiveModal(null)}
        user={user}
      />
      <ChangePasswordModal
        open={activeModal === "password"}
        onClose={() => setActiveModal(null)}
      />
      <ThemeModal
        open={activeModal === "theme"}
        onClose={() => setActiveModal(null)}
      />
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
