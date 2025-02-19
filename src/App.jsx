import React, { useEffect, useRef, useState, useCallback } from "react";
import ReactFlow, {
  Handle,
  Position,
  Background,
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
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [allMessages, setAllMessages] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const reactFlowWrapper = useRef(null);

  // Parámetros configurables
  const [startIndex, setStartIndex] = useState(0);
  const [sampleSize, setSampleSize] = useState(50);
  const [scale, setScale] = useState(75);

  // Nuevos parámetros:
  const [drawingStyle, setDrawingStyle] = useState("heart"); // "heart" o "timeline"
  const [orderType, setOrderType] = useState("default"); // "default", "date" o "random"
  const [heartMode, setHeartMode] = useState("line"); // "line" o "fill"

  // Estado para el gridFactor (densidad de la malla) en modo fill
  const [gridFactor, setGridFactor] = useState(2);

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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

  // Variables para mostrar el máximo permitido en cada slider
  const maxStartIndex =
    allMessages.length > 0 ? allMessages.length - sampleSize : 0;
  const maxSampleSize =
    allMessages.length > 0 ? allMessages.length - startIndex : 1;

  // Función para parsear cada línea de mensaje
  const parseLine = (line) => {
    const regex =
      /^\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+a las\s+(\d{1,2}:\d{1,2})\s+-\s+(.*?):\s+(.*?)\s*$/;
    const match = line.match(regex);
    if (match) {
      const [, date, time, sender, message] = match;
      return { date, time, sender, message };
    }
    return null;
  };

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

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + "resultados.txt")
      .then((res) => res.text())
      .then((text) => {
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
      })
      .catch((error) => console.error("Error al leer el archivo:", error));
  }, []);

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

    // Seleccionamos sin wrapping para evitar repeticiones
    const selected = sortedMessages.slice(startIndex, startIndex + sampleSize);
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    let newNodes = [];
    let newEdges = [];

    if (drawingStyle === "heart") {
      if (heartMode === "line") {
        // Modo "line": se posicionan los mensajes a lo largo del contorno
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
            },
            position: {
              x: centerX + xFactor * scale - nodeWidth / 2,
              y: centerY - yFactor * scale - nodeHeight / 2,
            },
          };
        });
      } else if (heartMode === "fill") {
        // En modo "fill" queremos:
        // 1. Colocar algunos mensajes sobre el contorno del corazón
        // 2. Y luego distribuir el resto en el interior usando una malla (grid)

        // 1. Calcular el contorno (polígono) del corazón
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

        // Calcular el bounding box del contorno
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

        // Definir qué fracción de nodos se ubica en el contorno (por ejemplo, 30%)
        const outlineFraction = 0.3;
        const outlineCount = Math.min(
          totalNodes,
          Math.floor(totalNodes * outlineFraction)
        );
        const interiorCount = totalNodes - outlineCount;

        // 2. Obtener posiciones a lo largo del contorno (outline)
        const outlinePositions = [];
        for (let i = 0; i < outlineCount; i++) {
          // Muestreamos de forma equidistante a lo largo del array "polygon"
          const index = Math.floor((i / outlineCount) * polygon.length);
          outlinePositions.push(polygon[index]);
        }

        // 3. Generar la malla (grid) para el interior usando el gridFactor del estado
        const R = Math.ceil(Math.sqrt(interiorCount) * gridFactor);
        const C = R; // malla cuadrada
        const cellWidth = (polyMaxX - polyMinX) / C;
        const cellHeight = (polyMaxY - polyMinY) / R;

        // Generar candidatos: centro de cada celda que esté dentro del polígono
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

        // Ordenar candidatos (por ejemplo, de arriba hacia abajo y de izquierda a derecha)
        candidatePoints.sort((a, b) =>
          a.y === b.y ? a.x - b.x : a.y - b.y
        );

        // Seleccionar de forma equidistante la cantidad necesaria de posiciones para el interior
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

        // 4. Combinar las posiciones: primero las del contorno y luego las del interior
        const finalPositions = outlinePositions.concat(gridPoints);

        // 5. Asignar cada mensaje a una posición de finalPositions
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
            },
            position: {
              x: pos.x - nodeWidth / 2,
              y: pos.y - nodeHeight / 2,
            },
          };
        });
      }
      // Conectar los nodos secuencialmente
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
        newNodes.push({
          id: `${index}`,
          type: "simple",
          data: {
            ...msg,
            message: formattedMessage,
            color: msg.sender.toLowerCase().includes("andrea")
              ? "#FF69B4"
              : "#1E90FF",
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
  }, [allMessages, startIndex, sampleSize, scale, drawingStyle, orderType, heartMode, gridFactor]);

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

  function filter(node) {
    return node.tagName !== "I";
  }

  async function exportDiagramSVGAndPNG() {
    try {
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
      const allElements = clone.querySelectorAll(
        ".react-flow__node, .react-flow__edge"
      );
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      const cloneRect = clone.getBoundingClientRect();
      allElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const left = rect.left - cloneRect.left;
        const top = rect.top - cloneRect.top;
        const right = left + rect.width;
        const bottom = top + rect.height;
        if (left < minX) minX = left;
        if (top < minY) minY = top;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
      });
      if (minX === Infinity) {
        minX = 0;
        minY = 0;
        maxX = clone.offsetWidth;
        maxY = clone.offsetHeight;
      }
      const margin = 20;
      minX -= margin;
      minY -= margin;
      maxX += margin;
      maxY += margin;
      const width = maxX - minX;
      const height = maxY - minY;
      const scaleFactor = 2;
      const scaledWidth = width * scaleFactor;
      const scaledHeight = height * scaleFactor;
      clone.style.width = `${scaledWidth}px`;
      clone.style.height = `${scaledHeight}px`;
      const viewport = clone.querySelector(".react-flow__viewport");
      if (viewport) {
        viewport.style.transform = `translate(${-minX * scaleFactor}px, ${-minY * scaleFactor}px) scale(${scaleFactor})`;
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
    } catch (error) {
      console.error("Error al exportar el diagrama:", error);
    }
  }

  if (!authenticated) {
    return (
      <div
        style={{
          display: "flex",
          height: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            border: "1px solid #ccc",
            padding: "20px",
            borderRadius: "8px",
            boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
          }}
        >
          <h2 style={{ marginBottom: "15px" }}>Autenticación</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (password === "amor") {
                setAuthenticated(true);
              } else {
                alert(
                  "Contraseña incorrecta. Pista: tiene 4 letras y se celebra hoy"
                );
              }
            }}
          >
            <label
              style={{
                fontWeight: "bold",
                marginBottom: "10px",
                display: "block",
              }}
            >
              Contraseña:
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "200px",
                padding: "5px",
                borderRadius: "4px",
                border: "1px solid #ccc",
                marginBottom: "15px",
              }}
              placeholder="Ingrese contraseña"
            />
            <button
              type="submit"
              style={{
                padding: "8px 16px",
                borderRadius: "4px",
                backgroundColor: "#1E90FF",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                width: "100%",
              }}
            >
              Ingresar
            </button>
          </form>
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: "relative" }}>
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
      <button
        onClick={exportDiagramSVGAndPNG}
        style={{ position: "absolute", zIndex: 999 }}
      >
        Exportar Diagrama a SVG y PNG (Descargar)
      </button>
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
