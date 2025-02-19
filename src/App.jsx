import React, { useEffect, useRef, useState, useCallback } from "react";
import ReactFlow, {
  Handle,
  Position,
  Controls,
  ConnectionLineType,
} from "reactflow";
import * as htmlToImage from "html-to-image";
import "reactflow/dist/style.css";
import "./App.css";

// Función para insertar saltos de línea cada 'limit' caracteres
function formatMessage(text, limit = 80) {
  let result = "";
  for (let i = 0; i < text.length; i += limit) {
    result += text.slice(i, i + limit) + "\n";
  }
  return result;
}

// Función auxiliar: determina si un punto está dentro de un polígono
function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    let xi = polygon[i].x,
      yi = polygon[i].y;
    let xj = polygon[j].x,
      yj = polygon[j].y;
    let intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 0.000001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const SimpleNode = ({ data }) => {
  return (
    <div
      style={{
        border: `2px solid ${data.color}`,
        borderRadius: "4px",
        padding: "8px",
        background: "#fff",
        textAlign: "left",
        minWidth: "200px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
        position: "relative",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="a"
        style={{ opacity: 0, height: 0, width: 0 }}
      />
      <div
        style={{
          fontSize: "12px",
          color: "#333",
          marginBottom: "4px",
          borderBottom: `1px solid ${data.color}`,
          paddingBottom: "4px",
        }}
      >
        <strong>{data.date}</strong> - <strong>{data.time}</strong>
      </div>
      <div
        style={{
          fontWeight: "bold",
          marginBottom: "4px",
          color: data.color,
        }}
      >
        {data.sender}
      </div>
      <div style={{ fontSize: "14px", color: "#555", whiteSpace: "pre-line" }}>
        {data.message}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="a"
        style={{ opacity: 0, height: 0, width: 0 }}
      />
    </div>
  );
};

const nodeTypes = { simple: SimpleNode };

function App() {
  const [allMessages, setAllMessages] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const reactFlowWrapper = useRef(null);

  // Parámetros configurables
  const [startIndex, setStartIndex] = useState(0);
  const [sampleSize, setSampleSize] = useState(50);
  const [scale, setScale] = useState(75);

  // Parámetros de visualización
  const [drawingStyle, setDrawingStyle] = useState("heart"); // "heart" o "timeline"
  const [orderType, setOrderType] = useState("default"); // "default", "date" o "random"
  const [heartMode, setHeartMode] = useState("line"); // "line" o "fill"
  const [gridFactor, setGridFactor] = useState(1.6);

  // Overlay de exportación
  const [exporting, setExporting] = useState(false);

  // Estados para el modal de carga de fichero
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [modalMessages, setModalMessages] = useState([]);
  const [filterText, setFilterText] = useState("");

  // Función para dormir (usada en exportación)
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Función para procesar el texto del fichero (para el fetch por defecto)
  const processFileText = (text) => {
    const rawLines = text.split("\n");
    const mergedLines = [];
    let currentLine = "";
    const dateStartRegex = /^\s*\d{1,2}\/\d{1,2}\/\d{2,4}/;
    rawLines.forEach((line) => {
      if (dateStartRegex.test(line)) {
        if (currentLine !== "") {
          mergedLines.push(currentLine);
        }
        currentLine = line.trim();
      } else {
        currentLine += " " + line.trim();
      }
    });
    if (currentLine !== "") mergedLines.push(currentLine);
    const messages = mergedLines
      .map(parseLine)
      .filter((msg) => msg !== null);
    setAllMessages(messages);
  };

  // Se carga el fichero por defecto
  useEffect(() => {
    fetch(import.meta.env.BASE_URL + "resultados.txt")
      .then((res) => res.text())
      .then((text) => {
        processFileText(text);
      })
      .catch((error) => console.error("Error al leer el archivo:", error));
  }, []);

  // Función de parseo (actualizada para admitir "a las" o coma)
  const parseLine = (line) => {
    const regex =
      /^\s*(\d{1,2}\/\d{1,2}\/\d{2,4})[,\s]*(?:a las\s+)?(\d{1,2}:\d{1,2})\s+-\s+(.*?):\s+(.*?)\s*$/;
    const match = line.match(regex);
    if (match) {
      const [, date, time, sender, message] = match;
      return { date, time, sender, message };
    }
    return null;
  };

  // Procesamiento del fichero para el modal (sin afectar el estado global hasta confirmar)
  const processModalFileText = (text) => {
    const rawLines = text.split("\n");
    const mergedLines = [];
    let currentLine = "";
    const dateStartRegex = /^\s*\d{1,2}\/\d{1,2}\/\d{2,4}/;
    rawLines.forEach((line) => {
      if (dateStartRegex.test(line)) {
        if (currentLine !== "") {
          mergedLines.push(currentLine);
        }
        currentLine = line.trim();
      } else {
        currentLine += " " + line.trim();
      }
    });
    if (currentLine !== "") mergedLines.push(currentLine);
    const messages = mergedLines
      .map(parseLine)
      .filter((msg) => msg !== null);
    setModalMessages(messages);
  };

  // Handler para el fichero dentro del modal
  const handleModalFileUpload = (event) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        processModalFileText(text);
      };
      reader.readAsText(file);
    }
  };

  // Actualiza startIndex y sampleSize de forma dependiente
  const handleStartIndexChange = (e) => {
    const newStartIndex = Number(e.target.value);
    const maxSampleSize = allMessages.length - newStartIndex;
    if (sampleSize > maxSampleSize) {
      setSampleSize(maxSampleSize);
    }
    setStartIndex(newStartIndex);
  };

  const handleSampleSizeChange = (e) => {
    const newSampleSize = Number(e.target.value);
    const maxStartIndex = allMessages.length - newSampleSize;
    if (startIndex > maxStartIndex) {
      setStartIndex(maxStartIndex);
    }
    setSampleSize(newSampleSize);
  };

  const maxStartIndex =
    allMessages.length > 0 ? allMessages.length - sampleSize : 0;
  const maxSampleSize =
    allMessages.length > 0 ? allMessages.length - startIndex : 1;

  const parseDateTime = (msg) => {
    const parts = msg.date.split("/");
    if (parts.length < 3) return new Date();
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (year < 100) {
      year += 2000;
    }
    const [hour, minute] = msg.time.split(":").map((n) => parseInt(n, 10));
    return new Date(year, month, day, hour, minute);
  };

  const generateNodes = useCallback(() => {
    if (!allMessages.length) return;
    let sortedMessages = [...allMessages];
    if (orderType === "default") {
      sortedMessages.sort((a, b) => a.message.length - b.message.length);
    } else if (orderType === "date") {
      sortedMessages.sort((a, b) => parseDateTime(a) - parseDateTime(b));
    } else if (orderType === "random") {
      for (let i = sortedMessages.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sortedMessages[i], sortedMessages[j]] = [
          sortedMessages[j],
          sortedMessages[i],
        ];
      }
    }

    const selected = sortedMessages.slice(startIndex, startIndex + sampleSize);
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    let newNodes = [];
    let newEdges = [];

    if (drawingStyle === "heart") {
      if (heartMode === "line") {
        const count = selected.length;
        newNodes = selected.map((msg, index) => {
          const t = (index / count) * 2 * Math.PI;
          const xFactor = 16 * Math.pow(Math.sin(t), 3);
          const yFactor =
            13 * Math.cos(t) -
            5 * Math.cos(2 * t) -
            2 * Math.cos(3 * t) -
            Math.cos(4 * t);
          const formattedMessage = formatMessage(msg.message, 80);
          const lines = formattedMessage.split("\n");
          const maxLineLength = Math.max(...lines.map((l) => l.length));
          const nodeWidth = Math.max(200, maxLineLength * 7 + 16);
          const headerHeight = 30;
          const messageHeight = lines.length * 20;
          const nodeHeight = headerHeight + messageHeight + 16;
          return {
            id: `${index}`,
            type: "simple",
            data: {
              ...msg,
              message: formattedMessage,
              color: msg.sender.toLowerCase().includes("andrea")
                ? "#FF69B4"
                : "#1E90FF",
              width: nodeWidth,
              height: nodeHeight,
            },
            position: {
              x: centerX + xFactor * scale - nodeWidth / 2,
              y: centerY - yFactor * scale - nodeHeight / 2,
            },
          };
        });
      } else if (heartMode === "fill") {
        const polygon = [];
        const samples = 100;
        for (let i = 0; i <= samples; i++) {
          const t = (i / samples) * 2 * Math.PI;
          const xFactor = 16 * Math.pow(Math.sin(t), 3);
          const yFactor =
            13 * Math.cos(t) -
            5 * Math.cos(2 * t) -
            2 * Math.cos(3 * t) -
            Math.cos(4 * t);
          const x = centerX + xFactor * scale;
          const y = centerY - yFactor * scale;
          polygon.push({ x, y });
        }

        let polyMinX = Infinity,
          polyMinY = Infinity,
          polyMaxX = -Infinity,
          polyMaxY = -Infinity;
        polygon.forEach((p) => {
          if (p.x < polyMinX) polyMinX = p.x;
          if (p.y < polyMinY) polyMinY = p.y;
          if (p.x > polyMaxX) polyMaxX = p.x;
          if (p.y > polyMaxY) polyMaxY = p.y;
        });

        const totalNodes = selected.length;
        const outlineFraction = 0.3;
        const outlineCount = Math.min(
          totalNodes,
          Math.floor(totalNodes * outlineFraction)
        );
        const interiorCount = totalNodes - outlineCount;

        const outlinePositions = [];
        for (let i = 0; i < outlineCount; i++) {
          const index = Math.floor((i / outlineCount) * polygon.length);
          outlinePositions.push(polygon[index]);
        }

        const R = Math.ceil(Math.sqrt(interiorCount) * gridFactor);
        const C = R;
        const cellWidth = (polyMaxX - polyMinX) / C;
        const cellHeight = (polyMaxY - polyMinY) / R;

        const candidatePoints = [];
        for (let i = 0; i < R; i++) {
          for (let j = 0; j < C; j++) {
            const x = polyMinX + (j + 0.5) * cellWidth;
            const y = polyMinY + (i + 0.5) * cellHeight;
            if (pointInPolygon({ x, y }, polygon)) {
              candidatePoints.push({ x, y });
            }
          }
        }

        candidatePoints.sort((a, b) =>
          a.y === b.y ? a.x - b.x : a.y - b.y
        );

        let gridPoints = [];
        if (candidatePoints.length >= interiorCount) {
          const step = candidatePoints.length / interiorCount;
          for (let i = 0; i < interiorCount; i++) {
            gridPoints.push(candidatePoints[Math.floor(i * step)]);
          }
        } else {
          gridPoints = [...candidatePoints];
          while (gridPoints.length < interiorCount) {
            gridPoints.push({ x: centerX, y: centerY });
          }
        }

        const finalPositions = outlinePositions.concat(gridPoints);

        newNodes = selected.map((msg, index) => {
          const formattedMessage = formatMessage(msg.message, 80);
          const lines = formattedMessage.split("\n");
          const maxLineLength = Math.max(...lines.map((l) => l.length));
          const nodeWidth = Math.max(200, maxLineLength * 7 + 16);
          const headerHeight = 30;
          const messageHeight = lines.length * 20;
          const nodeHeight = headerHeight + messageHeight + 16;
          const pos = finalPositions[index];
          return {
            id: `${index}`,
            type: "simple",
            data: {
              ...msg,
              message: formattedMessage,
              color: msg.sender.toLowerCase().includes("andrea")
                ? "#FF69B4"
                : "#1E90FF",
              width: nodeWidth,
              height: nodeHeight,
            },
            position: {
              x: pos.x - nodeWidth / 2,
              y: pos.y - nodeHeight / 2,
            },
          };
        });
      }
      for (let i = 0; i < newNodes.length - 1; i++) {
        newEdges.push({
          id: `e${i}-${i + 1}`,
          source: newNodes[i].id,
          target: newNodes[i + 1].id,
          animated: true,
          style: { stroke: newNodes[i].data.color, strokeWidth: 2 },
        });
      }
    } else if (drawingStyle === "timeline") {
      const timelineScale = scale / 75;
      let currentX = 50 * timelineScale;
      const margin = 50 * timelineScale;
      newNodes = [];
      selected.forEach((msg, index) => {
        const formattedMessage = formatMessage(msg.message, 80);
        const lines = formattedMessage.split("\n");
        const maxLineLength = Math.max(...lines.map((l) => l.length));
        const nodeWidth = Math.max(200, maxLineLength * 7 + 16);
        const headerHeight = 30;
        const messageHeight = lines.length * 20;
        const nodeHeight = headerHeight + messageHeight + 16;
        newNodes.push({
          id: `${index}`,
          type: "simple",
          data: {
            ...msg,
            message: formattedMessage,
            color: msg.sender.toLowerCase().includes("andrea")
              ? "#FF69B4"
              : "#1E90FF",
            width: nodeWidth,
            height: nodeHeight,
          },
          position: { x: currentX, y: centerY },
        });
        currentX += nodeWidth + margin;
      });
      for (let i = 0; i < newNodes.length - 1; i++) {
        newEdges.push({
          id: `e${i}-${i + 1}`,
          source: newNodes[i].id,
          target: newNodes[i + 1].id,
          animated: true,
          style: { stroke: newNodes[i].data.color, strokeWidth: 2 },
        });
      }
    }
    setNodes(newNodes);
    setEdges(newEdges);
  }, [
    allMessages,
    startIndex,
    sampleSize,
    scale,
    drawingStyle,
    orderType,
    heartMode,
    gridFactor,
  ]);

  useEffect(() => {
    generateNodes();
  }, [
    allMessages,
    startIndex,
    sampleSize,
    scale,
    drawingStyle,
    orderType,
    heartMode,
    gridFactor,
    generateNodes,
  ]);

  const controlsStyle = {
    position: "absolute",
    top: 20,
    right: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    border: "1px solid #ccc",
    padding: "10px",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    zIndex: 10,
    fontFamily: "sans-serif",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    width: "250px",
  };

  const labelStyle = {
    fontWeight: "bold",
    color: "black",
    marginBottom: "3px",
  };

  const rangeInputStyle = {
    width: "100%",
    padding: "0",
    margin: "0",
    border: "none",
  };

  const selectInputStyle = {
    width: "100%",
    padding: "5px",
    borderRadius: "4px",
    border: "1px solid #ccc",
  };

  async function exportDiagramSVGAndPNG() {
    try {
      setExporting(true);
      await sleep(1000);
      if (reactFlowInstance) {
        reactFlowInstance.setEdges((eds) =>
          eds.map((edge) => {
            edge.animated = false;
            edge.markerEnd = {
              type: "arrow",
              width: 15,
              height: 15,
            };
            return edge;
          })
        );
        reactFlowInstance.fitView();
      }
      await sleep(1000);
      const element = reactFlowWrapper.current;
      if (!element) {
        console.error("Contenedor no encontrado");
        setExporting(false);
        return;
      }
      const clone = element.cloneNode(true);
      clone.style.overflow = "visible";
      clone.style.position = "absolute";
      clone.style.top = "0px";
      clone.style.left = "0px";
      clone.style.width = `${element.scrollWidth}px`;
      clone.style.height = `${element.scrollHeight}px`;
      document.body.appendChild(clone);

      let bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      nodes.forEach((node) => {
        const { x, y } = node.position;
        const width = node.data.width || 200;
        const height = node.data.height || 100;
        bb.minX = Math.min(bb.minX, x);
        bb.minY = Math.min(bb.minY, y);
        bb.maxX = Math.max(bb.maxX, x + width);
        bb.maxY = Math.max(bb.maxY, y + height);
      });
      if (bb.minX === Infinity) {
        bb = { minX: 0, minY: 0, maxX: clone.offsetWidth, maxY: clone.offsetHeight };
      }
      const margin = 20;
      const clipWidth = bb.maxX - bb.minX + margin * 2;
      const clipHeight = bb.maxY - bb.minY + margin * 2;
      const scaleFactor = 2;
      const scaledWidth = clipWidth * scaleFactor;
      const scaledHeight = clipHeight * scaleFactor;

      clone.style.width = `${scaledWidth}px`;
      clone.style.height = `${scaledHeight}px`;

      const viewport = clone.querySelector(".react-flow__viewport");
      if (viewport) {
        viewport.style.transform = `translate(${-bb.minX * scaleFactor + margin * scaleFactor}px, ${
          -bb.minY * scaleFactor + margin * scaleFactor
        }px) scale(${scaleFactor})`;
      }

      const svgContent = await htmlToImage.toSvg(clone, {
        filter: (node) => node.tagName !== "I",
        width: scaledWidth,
        height: scaledHeight,
      });
      const svgDataUrl = svgContent;
      const pngDataUrl = await htmlToImage.toPng(clone, {
        filter: (node) => node.tagName !== "I",
        width: scaledWidth,
        height: scaledHeight,
        pixelRatio: scaleFactor,
      });
      document.body.removeChild(clone);

      const svgLink = document.createElement("a");
      svgLink.download = "diagrama.svg";
      svgLink.href = svgDataUrl;
      svgLink.click();
      const pngLink = document.createElement("a");
      pngLink.download = "diagrama.png";
      pngLink.href = pngDataUrl;
      pngLink.click();
      setExporting(false);
    } catch (error) {
      console.error("Error al exportar el diagrama:", error);
      setExporting(false);
    }
  }

  // Filtrado en tiempo real de los mensajes del modal
  const filteredModalMessages = modalMessages.filter((msg) => {
    if (!filterText.trim()) return true;
    const search = filterText.toLowerCase();
    return (
      msg.message.toLowerCase().includes(search) ||
      msg.sender.toLowerCase().includes(search) ||
      msg.date.toLowerCase().includes(search) ||
      msg.time.toLowerCase().includes(search)
    );
  });

  // Al confirmar en el modal, se carga el fichero filtrado en el diagrama
  const confirmModalUpload = () => {
    setAllMessages(filteredModalMessages);
    setShowUploadModal(false);
    setFilterText("");
    setModalMessages([]);
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Botón para abrir el modal de carga (esquina superior izquierda) */}
      <button
        onClick={() => setShowUploadModal(true)}
        style={{
          position: "absolute",
          top: "20px",
          left: "20px",
          zIndex: 1000,
          padding: "5px 10px",
          border: "1px solid #ccc",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        Subir archivo personalizado
      </button>

      {/* Botón para exportar (esquina superior derecha) */}
      <button
        onClick={exportDiagramSVGAndPNG}
        style={{
          position: "absolute",
          top: "20px",
          left: "300px",
          zIndex: 1000,
          padding: "5px 10px",
          border: "1px solid #ccc",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        Exportar Diagrama a SVG y PNG (Descargar)
      </button>

      {/* Modal de carga de fichero y filtrado */}
      {showUploadModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 2000,
          }}
        >
          <div
            style={{
              padding: "20px",
              borderRadius: "8px",
              width: "90%",
              maxWidth: "600px",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h2>Subir y filtrar archivo</h2>
            {/* Input para elegir el fichero */}
            <input type="file" accept=".txt" onChange={handleModalFileUpload} />
            {/* Input para filtrar */}
            {modalMessages.length > 0 && (
              <>
                <div style={{ marginTop: "15px" }}>
                  <label style={{ fontWeight: "bold" }}>Filtrar mensajes:</label>
                  <input
                    type="text"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "5px",
                      marginTop: "5px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                    }}
                  />
                </div>
                {/* Previsualización de las líneas filtradas */}
                <div
                  style={{
                    marginTop: "15px",
                    padding: "10px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    maxHeight: "300px",
                    overflowY: "auto",
                  }}
                >
                  {filteredModalMessages.map((msg, index) => (
                    <div
                      key={index}
                      style={{
                        padding: "5px 0",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      <strong>{msg.date} - {msg.time}</strong> -{" "}
                      <span style={{ color: msg.sender.toLowerCase().includes("andrea") ? "#FF69B4" : "#1E90FF" }}>
                        {msg.sender}
                      </span>: {msg.message}
                    </div>
                  ))}
                  {filteredModalMessages.length === 0 && (
                    <p style={{ fontStyle: "italic", color: "#777" }}>No hay mensajes que cumplan el filtro.</p>
                  )}
                </div>
              </>
            )}
            {/* Botones de acción */}
            <div
              style={{
                marginTop: "20px",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setFilterText("");
                  setModalMessages([]);
                }}
                style={{
                  padding: "5px 10px",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  background: "#f0f0f0",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmModalUpload}
                style={{
                  padding: "5px 10px",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  background: "#d0f0d0",
                  cursor: "pointer",
                }}
                disabled={modalMessages.length === 0}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay de exportación */}
      {exporting && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.5)",
            color: "#fff",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 3000,
            fontSize: "24px",
          }}
        >
          Generando amor...
        </div>
      )}

      {/* Panel de controles */}
      <div style={controlsStyle}>
        <div>
          <label style={labelStyle}>
            Start Index: {startIndex} (Max: {maxStartIndex})
          </label>
          <input
            type="range"
            min="0"
            max={allMessages.length > 0 ? allMessages.length - sampleSize : 0}
            value={startIndex}
            onChange={handleStartIndexChange}
            style={rangeInputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>
            Sample Size: {sampleSize} (Max: {maxSampleSize})
          </label>
          <input
            type="range"
            min="1"
            max={allMessages.length > 0 ? allMessages.length - startIndex : 1}
            value={sampleSize}
            onChange={handleSampleSizeChange}
            style={rangeInputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Scale: {scale}</label>
          <input
            type="range"
            min="1"
            max="150"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            style={rangeInputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Estilo de dibujo:</label>
          <select
            value={drawingStyle}
            onChange={(e) => setDrawingStyle(e.target.value)}
            style={selectInputStyle}
          >
            <option value="heart">Corazón</option>
            <option value="timeline">Timeline</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Orden de mensajes:</label>
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value)}
            style={selectInputStyle}
          >
            <option value="default">Por longitud</option>
            <option value="date">Por fecha</option>
            <option value="random">Aleatorio</option>
          </select>
        </div>
        {drawingStyle === "heart" && (
          <div>
            <label style={labelStyle}>Modo Corazón:</label>
            <select
              value={heartMode}
              onChange={(e) => setHeartMode(e.target.value)}
              style={selectInputStyle}
            >
              <option value="line">Line</option>
              <option value="fill">Fill</option>
            </select>
          </div>
        )}
        {drawingStyle === "heart" && heartMode === "fill" && (
          <div>
            <label style={labelStyle}>Grid Factor: {gridFactor}</label>
            <input
              type="range"
              min="1"
              max="10"
              step={0.1}
              value={gridFactor}
              onChange={(e) => setGridFactor(Number(e.target.value))}
              style={rangeInputStyle}
            />
          </div>
        )}
      </div>
      <div
        className="reactflow-wrapper react-flow-exporting"
        ref={reactFlowWrapper}
        style={{ width: "100%", height: "100vh" }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onLoad={setReactFlowInstance}
          nodeTypes={nodeTypes}
          connectionLineType={ConnectionLineType.SmoothStep}
        >
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

export default App;
