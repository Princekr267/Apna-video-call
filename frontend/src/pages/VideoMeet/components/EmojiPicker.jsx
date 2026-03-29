import React, { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import EmojiEmotionsIcon from '@mui/icons-material/EmojiEmotions';

const EMOJI_LIST = [
    '👍', '👎', '❤️', '😂', '😮', '😢', 
    '😍', '🎉', '👏', '🔥', '💯', '✨', 
    '🚀', '👋', '🙏', '💪', '🎊', '⭐', 
    '💡', '🌟', '✅', '💖', '🥳', '😎',
    '🤔', '😱', '🤩', '😴', '🤗', '😇'
];

// Emojis that should not rotate (they change meaning when flipped)
const NO_ROTATE_EMOJIS = ['👍', '👎', '👈', '👉', '👆', '👇', '☝️', '✌️', '🤘', '🤙', '🖖', '✊', '👊', '🤛', '🤜', '👌', '🤏', '✍️'];

export default function EmojiPicker({ onEmojiSelect }) {
    const [anchorEl, setAnchorEl] = useState(null);
    const open = Boolean(anchorEl);

    const handleClick = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleEmojiClick = (emoji) => {
        const shouldRotate = !NO_ROTATE_EMOJIS.includes(emoji);
        onEmojiSelect(emoji, shouldRotate);
        // Don't close the panel - removed handleClose()
    };

    const scrollableStyle = {
        maxHeight: '280px',
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingRight: '4px',
        paddingBottom: '8px'
    };

    const gridStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: '8px',
        padding: '4px',
        paddingBottom: '4px'
    };

    const buttonStyle = {
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        padding: '8px',
        fontSize: '1.5rem',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '44px',
        height: '44px',
        transition: 'all 0.2s ease'
    };

    return (
        <>
            <IconButton
                onClick={handleClick}
                className={open ? 'activeIcon' : 'inactiveIcon'}
                title="Send emoji reaction"
            >
                <EmojiEmotionsIcon />
            </IconButton>

            <Popover
                open={open}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{
                    vertical: 'top',
                    horizontal: 'center',
                }}
                transformOrigin={{
                    vertical: 'bottom',
                    horizontal: 'center',
                }}
                slotProps={{
                    paper: {
                        sx: {
                            backgroundColor: 'rgba(10, 15, 30, 0.95)',
                            backdropFilter: 'blur(20px)',
                            borderRadius: '16px',
                            padding: '12px',
                            width: '300px',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)'
                        }
                    }
                }}
            >
                <div style={scrollableStyle}>
                    <div style={gridStyle}>
                        {EMOJI_LIST.map((emoji, index) => (
                            <button
                                key={index}
                                style={buttonStyle}
                                onClick={() => handleEmojiClick(emoji)}
                                title={`Send ${emoji}`}
                                onMouseEnter={(e) => {
                                    e.target.style.background = 'rgba(255, 255, 255, 0.15)';
                                    e.target.style.transform = 'scale(1.15)';
                                }}
                                onMouseLeave={(e) => {
                                    e.target.style.background = 'rgba(255, 255, 255, 0.05)';
                                    e.target.style.transform = 'scale(1)';
                                }}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>
            </Popover>
        </>
    );
}
