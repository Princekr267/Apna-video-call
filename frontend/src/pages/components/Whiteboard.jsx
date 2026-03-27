import React, { useEffect, useRef, useState } from "react";
import { fabric } from "fabric";
import "../../styles/whiteboard.css";
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import EditIcon from '@mui/icons-material/Edit';
import AdsClickIcon from '@mui/icons-material/AdsClick';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import LayersClearIcon from '@mui/icons-material/LayersClear';

const bgDark = "#1e293b";

const Whiteboard = ({ socket, roomId, onClose }) => {
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const wrapperRef = useRef(null);

  const [tool, setTool] = useState("pencil");    // pencil, select, eraser, rect, circle, text
  const [color, setColor] = useState("#4ade80");
  const [lineWidth, setLineWidth] = useState(3);

  // History system
  const historyRef = useRef([]);
  const historyPos = useRef(-1);
  const isSyncing = useRef(false);

  // Calculate responsive canvas size
  const getCanvasSize = () => {
    const isMobile = window.innerWidth <= 768;
    const padding = isMobile ? 20 : 60;
    const toolbarHeight = isMobile ? 80 : 100;

    const maxWidth = window.innerWidth - padding;
    const maxHeight = window.innerHeight - toolbarHeight - padding;

    // Maintain 16:9 aspect ratio
    const aspectRatio = 16 / 9;
    let width = maxWidth;
    let height = width / aspectRatio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }

    return { width: Math.floor(width), height: Math.floor(height) };
  };

  // ── INIT FABRIC CANVAS ───────────────────────────────────────
  useEffect(() => {
    const { width, height } = getCanvasSize();

    const canvas = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      backgroundColor: bgDark,
      isDrawingMode: true,
      selection: true,
    });
    fabricRef.current = canvas;

    // Default brush styling
    canvas.freeDrawingBrush.color = color;
    canvas.freeDrawingBrush.width = lineWidth;

    // Push initial empty state to history
    saveHistory(canvas.toJSON());

    // ── EVENTS ──
    canvas.on('path:created', () => broadcastAndSave(canvas));
    canvas.on('object:modified', () => broadcastAndSave(canvas));
    canvas.on('object:added', (e) => {
      // Don't save if we are just syncing from sockets or history array
      if (!isSyncing.current) broadcastAndSave(canvas);
    });

    // Object Eraser logic
    canvas.on('mouse:down', (e) => {
      if (fabricRef.current?.eraserMode && e.target) {
        canvas.remove(e.target);
        broadcastAndSave(canvas);
      }
    });

    // Listen for custom tool clicks safely bypassing default pointer events
    canvas.on('mouse:down', (options) => {
      if (isSyncing.current) return;
      const pointer = canvas.getPointer(options.e);
      const activeTool = fabricRef.current?.currentTool;
      
      if (activeTool === 'rect') {
        const rect = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          fill: 'transparent',
          stroke: color,
          strokeWidth: lineWidth,
          width: 50,
          height: 50
        });
        canvas.add(rect);
        canvas.setActiveObject(rect);
        setTool('select'); // Switch to select to resize
      } else if (activeTool === 'circle') {
        const circle = new fabric.Circle({
          left: pointer.x,
          top: pointer.y,
          fill: 'transparent',
          stroke: color,
          strokeWidth: lineWidth,
          radius: 30
        });
        canvas.add(circle);
        canvas.setActiveObject(circle);
        setTool('select');
      } else if (activeTool === 'text') {
        const text = new fabric.IText('New Text', {
          left: pointer.x,
          top: pointer.y,
          fill: color,
          fontSize: lineWidth * 5,
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        text.selectAll();
        setTool('select');
      }
    });

    // Binding Keyboard Delete
    const handleKeyDown = (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (fabricRef.current) {
          const actives = fabricRef.current.getActiveObjects();
          if (actives.length && !actives[0].isEditing) {
            actives.forEach(obj => fabricRef.current.remove(obj));
            fabricRef.current.discardActiveObject();
            broadcastAndSave(fabricRef.current);
          }
        }
      }
    };

    // Handle window resize
    const handleResize = () => {
      if (fabricRef.current) {
        const { width, height } = getCanvasSize();
        fabricRef.current.setWidth(width);
        fabricRef.current.setHeight(height);
        fabricRef.current.renderAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);

    // Initial sync and server listener setup
    socket.emit("whiteboard:request-sync", { roomId });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      canvas.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, roomId]); // Dependency on socket/roomId ensure we re-bind on reconnect

  // ── TOOL & STATE SYNC ─────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    
    canvas.currentTool = tool;
    canvas.eraserMode = tool === 'eraser';
    
    // Toggle native Free Drawing
    canvas.isDrawingMode = (tool === 'pencil');
    
    // Toggle Object Selection capabilities
    canvas.selection = (tool === 'select');
    canvas.forEachObject((obj) => {
      obj.selectable = (tool === 'select');
      obj.evented = (tool === 'select' || tool === 'eraser');
    });

    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = color;
      canvas.freeDrawingBrush.width = lineWidth;
    }

    // Dynamic cursors natively injected
    if (tool === 'eraser') {
      canvas.defaultCursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="%23ff4444" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>') 12 12, crosshair`;
      canvas.hoverCursor = canvas.defaultCursor;
    } else if (tool === 'pencil' || tool === 'rect' || tool === 'circle' || tool === 'text') {
      canvas.defaultCursor = 'crosshair';
      canvas.hoverCursor = 'crosshair';
    } else {
      canvas.defaultCursor = 'default';
      canvas.hoverCursor = 'move';
    }
  }, [tool, color, lineWidth]);

  // ── HISTORY & SOCKET MANAGER ──────────────────────────────────
  const saveHistory = (json) => {
    // Trim any future history if we're saving a new action mid-undo
    if (historyPos.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyPos.current + 1);
    }
    historyRef.current.push(json);
    historyPos.current = historyRef.current.length - 1;
  };

  const broadcastAndSave = (canvas) => {
    if (isSyncing.current) return;
    const state = canvas.toJSON();
    saveHistory(state);
    
    if (socket) {
      socket.emit("whiteboard:update", { roomId, state });
      // Keep main server synchronized for late-joiners
      socket.emit("whiteboard:save-snapshot", { roomId, imageData: state });
    }
  };

  useEffect(() => {
    if (!socket) return;
    
    const handleUpdate = ({ state }) => {
      const canvas = fabricRef.current;
      if (!canvas || !state) return;
      isSyncing.current = true;
      canvas.loadFromJSON(state, () => {
        canvas.renderAll();
        isSyncing.current = false;
        // Sync history identically to stay perfectly parallel with peers
        saveHistory(state);
      });
    };

    const handleClear = () => {
      if (fabricRef.current) {
        isSyncing.current = true;
        fabricRef.current.clear();
        fabricRef.current.backgroundColor = bgDark;
        fabricRef.current.renderAll();
        isSyncing.current = false;
        saveHistory(fabricRef.current.toJSON());
      }
    };

    socket.on("whiteboard:update", handleUpdate);
    socket.on("whiteboard:sync", handleUpdate); // Late joiner exact sync
    socket.on("whiteboard:clear", handleClear);

    // Initial sync
    socket.emit("whiteboard:request-sync", { roomId });

    return () => {
      socket.off("whiteboard:update", handleUpdate);
      socket.off("whiteboard:sync", handleUpdate);
      socket.off("whiteboard:clear", handleClear);
    };
  }, [socket, roomId]);

  // ── ACTIONS ───────────────────────────────────────────────────
  const handleUndo = () => {
    if (historyPos.current > 0) {
      historyPos.current -= 1;
      const targetState = historyRef.current[historyPos.current];
      isSyncing.current = true;
      fabricRef.current.loadFromJSON(targetState, () => {
        fabricRef.current.renderAll();
        isSyncing.current = false;
        socket.emit("whiteboard:update", { roomId, state: targetState });
      });
    }
  };

  const handleRedo = () => {
    if (historyPos.current < historyRef.current.length - 1) {
      historyPos.current += 1;
      const targetState = historyRef.current[historyPos.current];
      isSyncing.current = true;
      fabricRef.current.loadFromJSON(targetState, () => {
        fabricRef.current.renderAll();
        isSyncing.current = false;
        socket.emit("whiteboard:update", { roomId, state: targetState });
      });
    }
  };

  const handleClear = () => {
    if (fabricRef.current) {
      fabricRef.current.clear();
      fabricRef.current.backgroundColor = bgDark;
      broadcastAndSave(fabricRef.current);
      socket.emit("whiteboard:clear", { roomId });
    }
  };

  const handleExport = () => {
    if (fabricRef.current) {
      const dataURL = fabricRef.current.toDataURL({ format: 'png', quality: 1 });
      const link = document.createElement('a');
      link.download = `whiteboard-${Date.now()}.png`;
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDeleteSelected = () => {
    if (fabricRef.current) {
      const actives = fabricRef.current.getActiveObjects();
      if (actives.length) {
        actives.forEach((obj) => fabricRef.current.remove(obj));
        fabricRef.current.discardActiveObject();
        broadcastAndSave(fabricRef.current);
      }
    }
  };

  return (
    <div className="whiteboard-panel">
      {/* Dynamic Glass Toolbar */}
      <div className="whiteboard-header fabric-toolbar">
        <div className="whiteboard-tools">
          <IconButton onClick={handleUndo} title="Undo" size="small" sx={{color:'var(--text-primary)'}} disabled={historyPos.current <= 0}>
            <UndoIcon fontSize="small"/>
          </IconButton>
          <IconButton onClick={handleRedo} title="Redo" size="small" sx={{color:'var(--text-primary)'}} disabled={historyPos.current >= historyRef.current.length - 1}>
            <RedoIcon fontSize="small"/>
          </IconButton>
          
          <div className="whiteboard-divider" style={{margin:'0 8px'}}/>

          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            title="Stroke Color"
            className="whiteboard-color"
          />

          <div className="whiteboard-brush-size">
            <input
              type="range"
              min="1" max="25"
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              title="Stroke Width"
            />
          </div>

          <div className="whiteboard-divider" style={{margin:'0 8px'}}/>

          <IconButton 
            onClick={() => setTool('select')} 
            color={tool === 'select' ? 'info' : 'inherit'} 
            title="Select & Move">
            <AdsClickIcon />
          </IconButton>

          <IconButton 
            onClick={() => setTool('pencil')} 
            color={tool === 'pencil' ? 'info' : 'inherit'} 
            title="Draw">
            <EditIcon />
          </IconButton>

          <IconButton 
            onClick={() => setTool('rect')} 
            color={tool === 'rect' ? 'info' : 'inherit'} 
            title="Rectangle">
            <CropSquareIcon />
          </IconButton>

          <IconButton 
            onClick={() => setTool('circle')} 
            color={tool === 'circle' ? 'info' : 'inherit'} 
            title="Circle">
            <RadioButtonUncheckedIcon />
          </IconButton>

          <IconButton 
            onClick={() => setTool('text')} 
            color={tool === 'text' ? 'info' : 'inherit'} 
            title="Text">
            <TextFieldsIcon />
          </IconButton>

          <IconButton
            onClick={() => setTool('eraser')}
            color={tool === 'eraser' ? 'error' : 'inherit'}
            title="Eraser - Click objects to delete them">
            <DeleteSweepIcon />
          </IconButton>
          
          <div className="whiteboard-divider" style={{margin:'0 8px'}}/>

          <IconButton onClick={handleDeleteSelected} title="Delete Selected Objects Only" color="warning" sx={{color: 'var(--accent-red)'}}>
            <DeleteIcon />
          </IconButton>

          <IconButton onClick={handleClear} title="Clear Entire Board (Delete Everything)" color="error" sx={{color: 'var(--accent-red)'}}>
            <LayersClearIcon />
          </IconButton>
          
          <IconButton onClick={handleExport} title="Export as Image" color="success" sx={{color: 'var(--accent-blue)'}}>
            <DownloadIcon />
          </IconButton>
        </div>

        <IconButton onClick={onClose} size="small" style={{ color: 'rgba(255,255,255,0.7)', marginLeft:'auto' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </div>

      {/* Canvas Wrapper */}
      <div className="whiteboard-canvas-wrapper" ref={wrapperRef}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
};

export default Whiteboard;
