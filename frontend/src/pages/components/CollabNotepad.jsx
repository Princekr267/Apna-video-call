/**
 * CollabNotepad - Collaborative Real-time Notepad Component
 *
 * Features:
 * - Rich text editing with Quill (bold, italic, strike, headings, lists, code blocks)
 * - Real-time sync via Yjs + y-websocket
 * - Multi-user cursors with names and unique colors
 * - Undo/Redo managed by Yjs (not browser)
 * - Download notes as .txt
 * - Connection status indicator
 * - Auto-cleanup on unmount
 *
 * Props:
 * - roomId: string - unique room identifier for document isolation
 * - userName: string - display name for cursor
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Quill from 'quill';
import QuillCursors from 'quill-cursors';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Switch from '@mui/material/Switch';
import { styled } from '@mui/material/styles';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import DownloadIcon from '@mui/icons-material/Download';
import CloseIcon from '@mui/icons-material/Close';
import CircleIcon from '@mui/icons-material/Circle';
import EditNoteIcon from '@mui/icons-material/EditNote';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatStrikethroughIcon from '@mui/icons-material/FormatStrikethrough';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import CodeIcon from '@mui/icons-material/Code';
import TitleIcon from '@mui/icons-material/Title';
import FormatClearIcon from '@mui/icons-material/FormatClear';
import 'quill/dist/quill.snow.css';
import '../../styles/notepad.css';

// Register Quill cursors module
Quill.register('modules/cursors', QuillCursors);

// AntSwitch styled component (green theme)
const AntSwitch = styled(Switch)(({ theme }) => ({
    width: 28,
    height: 16,
    padding: 0,
    display: 'flex',
    '&:active': {
        '& .MuiSwitch-thumb': {
            width: 15,
        },
        '& .MuiSwitch-switchBase.Mui-checked': {
            transform: 'translateX(9px)',
        },
    },
    '& .MuiSwitch-switchBase': {
        padding: 2,
        '&.Mui-checked': {
            transform: 'translateX(12px)',
            color: '#fff',
            '& + .MuiSwitch-track': {
                opacity: 1,
                backgroundColor: '#4ade80',
            },
        },
    },
    '& .MuiSwitch-thumb': {
        boxShadow: '0 2px 4px 0 rgb(0 35 11 / 20%)',
        width: 12,
        height: 12,
        borderRadius: 6,
        transition: theme.transitions.create(['width'], {
            duration: 200,
        }),
    },
    '& .MuiSwitch-track': {
        borderRadius: 16 / 2,
        opacity: 1,
        backgroundColor: 'rgba(255,255,255,.35)',
        boxSizing: 'border-box',
    },
}));

// Generate a consistent color based on user name
const getUserColor = (name) => {
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
        '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
        '#F8B500', '#00CED1', '#FF69B4', '#32CD32', '#FF7F50'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

const CollabNotepad = ({ roomId, userName, onClose, socket }) => {
    const editorRef = useRef(null);
    const toolbarRef = useRef(null);
    const quillRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isCollabEnabled, setIsCollabEnabled] = useState(true);
    const [activeUsers, setActiveUsers] = useState([]);

    // Sanitize and ensure valid userName
    const sanitizedUserName = userName && userName.trim()
        ? userName.trim()
        : `User-${Math.random().toString(36).substring(2, 7)}`;

    // Sanitize roomId
    const sanitizedRoomId = roomId.replace(/[^a-zA-Z0-9-_]/g, '_').replace(/^_+/, '').slice(0, 100) || 'default';

    // Initialize Quill editor (always)
    useEffect(() => {
        if (!editorRef.current || quillRef.current || !toolbarRef.current) return;

        // Initialize Quill editor
        const quill = new Quill(editorRef.current, {
            theme: 'snow',
            modules: {
                cursors: true,
                toolbar: {
                    container: toolbarRef.current
                },
                history: {
                    userOnly: true
                }
            },
            placeholder: 'Start taking notes...'
        });
        quillRef.current = quill;

        // Keyboard shortcuts for undo/redo
        const handleKeydown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) quill.history.redo();
                else quill.history.undo();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                quill.history.redo();
            }
        };

        editorRef.current.addEventListener('keydown', handleKeydown);

        // Cleanup
        return () => {
            editorRef.current?.removeEventListener('keydown', handleKeydown);
            if (quillRef.current) {
                quillRef.current = null;
            }
        };
    }, []);

    // Socket.io Collaboration Sync
    useEffect(() => {
        if (!quillRef.current || !socket || !isCollabEnabled) {
            setIsConnected(false);
            setActiveUsers([]);
            return;
        }

        const quill = quillRef.current;
        setIsConnected(true);

        const cursors = quill.getModule('cursors');
        const userColor = getUserColor(sanitizedUserName);

        let isApplyingRemoteUpdate = false;

        // --- Text Sync ---
        const handleNotepadUpdate = (delta) => {
            isApplyingRemoteUpdate = true;
            quill.updateContents(delta, 'silent');
            isApplyingRemoteUpdate = false;
        };

        const handleTextChange = (delta, oldDelta, source) => {
            if (source !== 'user' || isApplyingRemoteUpdate) return;
            socket.emit('notepad-update', delta, sanitizedRoomId);
        };

        // --- Multi-User Cursors ---
        const handleSelectionChange = (range) => {
            if (range) {
                socket.emit('notepad-cursor', {
                    name: sanitizedUserName,
                    color: userColor,
                    cursor: range
                }, sanitizedRoomId);
            }
        };

        const handleRemoteCursor = (cursorData, clientId) => {
            if (!cursorData || !cursorData.cursor) {
                cursors.removeCursor(clientId);
                setActiveUsers(prev => prev.filter(u => u.clientId !== clientId));
            } else {
                try {
                    cursors.createCursor(clientId, cursorData.name, cursorData.color);
                    cursors.moveCursor(clientId, cursorData.cursor);
                } catch (e) {}

                setActiveUsers(prev => {
                    const arr = prev.filter(u => u.clientId !== clientId);
                    arr.push({ clientId, name: cursorData.name, color: cursorData.color });
                    return arr;
                });
            }
        };

        // --- Document Bootstrap (Late joiners) ---
        let hasReceivedSync = false;
        
        // Request the full document content from existing users in the room
        socket.emit("notepad-request-sync", sanitizedRoomId);

        const handleNotepadRequestSync = (requesterSocketId) => {
            // Someone requested a full sync. Send our current contents back directly.
            const contents = quill.getContents();
            socket.emit("notepad-full-sync", contents, requesterSocketId);
        };

        const handleNotepadFullSync = (contents) => {
            // We received a full sync from someone. Apply it cleanly.
            if (!hasReceivedSync) {
                quill.setContents(contents, 'silent');
                hasReceivedSync = true;
            }
        };

        // Attach listeners to Socket.IO backend
        socket.on('notepad-update', handleNotepadUpdate);
        socket.on('notepad-cursor', handleRemoteCursor);
        socket.on('notepad-request-sync', handleNotepadRequestSync);
        socket.on('notepad-full-sync', handleNotepadFullSync);
        
        quill.on('text-change', handleTextChange);
        quill.on('selection-change', handleSelectionChange);

        return () => {
            socket.off('notepad-update', handleNotepadUpdate);
            socket.off('notepad-cursor', handleRemoteCursor);
            socket.off('notepad-request-sync', handleNotepadRequestSync);
            socket.off('notepad-full-sync', handleNotepadFullSync);

            // Emit a blank cursor to clear us from remote screens when we toggle off or unmount
            socket.emit('notepad-cursor', null, sanitizedRoomId);

            quill.off('text-change', handleTextChange);
            quill.off('selection-change', handleSelectionChange);

            setIsConnected(false);
            setActiveUsers([]);
            cursors.clearCursors();
        };
    }, [sanitizedRoomId, userName, isCollabEnabled, socket]);

    // Handle undo
    const handleUndo = useCallback(() => {
        quillRef.current?.history.undo();
    }, []);

    // Handle redo
    const handleRedo = useCallback(() => {
        quillRef.current?.history.redo();
    }, []);

    // Handle collaboration toggle
    const handleCollabToggle = useCallback((event) => {
        setIsCollabEnabled(event.target.checked);
    }, []);

    // Download notes as .txt
    const handleDownload = useCallback(() => {
        const quill = quillRef.current;
        if (!quill) return;

        const text = quill.getText();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `meeting-notes-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, []);

    return (
        <div className="notepad-panel">
            {/* Header */}
            <div className="notepad-header">
                <div className="notepad-header-left">
                    <EditNoteIcon className="notepad-title-icon" />
                    <h2>Notes</h2>
                </div>
                <div className="notepad-header-right">
                    <Tooltip title={isCollabEnabled ? "Collaboration enabled" : "Collaboration disabled"}>
                        <AntSwitch
                            checked={isCollabEnabled}
                            onChange={handleCollabToggle}
                            size="small"
                        />
                    </Tooltip>

                    {isCollabEnabled && isConnected && (
                        <Tooltip title="Real-time sync active">
                            <div className="notepad-status connected">
                                <CircleIcon />
                                <span>Live</span>
                            </div>
                        </Tooltip>
                    )}

                    <Tooltip title="Download notes">
                        <IconButton onClick={handleDownload} size="small" className="notepad-header-btn">
                            <DownloadIcon />
                        </IconButton>
                    </Tooltip>
                    {onClose && (
                        <Tooltip title="Close notepad">
                            <IconButton onClick={onClose} size="small" className="notepad-header-btn notepad-close-btn">
                                <CloseIcon />
                            </IconButton>
                        </Tooltip>
                    )}
                </div>
            </div>

            {/* Active Users */}
            {isCollabEnabled && activeUsers.length > 0 && (
                <div className="notepad-users">
                    {activeUsers.slice(0, 5).map((user, idx) => (
                        <Tooltip key={user.clientId || idx} title={user.name}>
                            <div
                                className="notepad-user-avatar"
                                style={{ backgroundColor: user.color }}
                            >
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                        </Tooltip>
                    ))}
                    {activeUsers.length > 5 && (
                        <div className="notepad-user-count">+{activeUsers.length - 5}</div>
                    )}
                </div>
            )}

            {/* Custom Toolbar */}
            <div ref={toolbarRef} className="notepad-toolbar">
                <div className="notepad-toolbar-group">
                    <Tooltip title="Bold (Ctrl+B)">
                        <button className="ql-bold"><FormatBoldIcon /></button>
                    </Tooltip>
                    <Tooltip title="Italic (Ctrl+I)">
                        <button className="ql-italic"><FormatItalicIcon /></button>
                    </Tooltip>
                    <Tooltip title="Strikethrough">
                        <button className="ql-strike"><FormatStrikethroughIcon /></button>
                    </Tooltip>
                </div>
                <div className="notepad-toolbar-divider" />
                <div className="notepad-toolbar-group">
                    <Tooltip title="Heading 1">
                        <button className="ql-header" value="1"><TitleIcon style={{ fontSize: '1.3rem' }} /></button>
                    </Tooltip>
                    <Tooltip title="Heading 2">
                        <button className="ql-header" value="2"><TitleIcon style={{ fontSize: '1rem' }} /></button>
                    </Tooltip>
                </div>
                <div className="notepad-toolbar-divider" />
                <div className="notepad-toolbar-group">
                    <Tooltip title="Bullet List">
                        <button className="ql-list" value="bullet"><FormatListBulletedIcon /></button>
                    </Tooltip>
                    <Tooltip title="Numbered List">
                        <button className="ql-list" value="ordered"><FormatListNumberedIcon /></button>
                    </Tooltip>
                </div>
                <div className="notepad-toolbar-divider" />
                <div className="notepad-toolbar-group">
                    <Tooltip title="Code Block">
                        <button className="ql-code-block"><CodeIcon /></button>
                    </Tooltip>
                    <Tooltip title="Clear Formatting">
                        <button className="ql-clean"><FormatClearIcon /></button>
                    </Tooltip>
                </div>
                <div className="notepad-toolbar-spacer" />
                <div className="notepad-toolbar-group notepad-history-btns">
                    <Tooltip title="Undo (Ctrl+Z)">
                        <IconButton onClick={handleUndo} size="small">
                            <UndoIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Redo (Ctrl+Y)">
                        <IconButton onClick={handleRedo} size="small">
                            <RedoIcon />
                        </IconButton>
                    </Tooltip>
                </div>
            </div>

            {/* Editor */}
            <div className="notepad-editor-container">
                <div ref={editorRef} className="notepad-editor"></div>
            </div>
        </div>
    );
};

export default CollabNotepad;
