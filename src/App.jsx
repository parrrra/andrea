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
  // Guarda todos los mensajes parseados (sin ordenar)
  const [allMessages, setAllMessages] = useState([]);
  // Nodos y aristas a mostrar
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const reactFlowWrapper = useRef(null);

  // Parámetros configurables
  const [startIndex, setStartIndex] = useState(0);
  const [sampleSize, setSampleSize] = useState(50);
  // Se renombra heartScale a scale para que sirva en ambos modos
  const [scale, setScale] = useState(75);

  // Nuevos parámetros:
  const [drawingStyle, setDrawingStyle] = useState("heart"); // "heart" o "timeline"
  const [orderType, setOrderType] = useState("default"); // "default" (por longitud), "date" o "random"

  // Función de espera
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Función para parsear cada línea de mensaje
  const parseLine = (line) => {
    // Formato: "dd/mm/yy a las hh:mm - sender: message"
    const regex =
      /^\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+a las\s+(\d{1,2}:\d{1,2})\s+-\s+(.*?):\s+(.*?)\s*$/;
    const match = line.match(regex);
    if (match) {
      const [, date, time, sender, message] = match;
      return { date, time, sender, message };
    }
    return null;
  };

  // Función para parsear fecha y hora a objeto Date (asumiendo formato dd/mm/yy y 24h)
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

  // Carga y parseo de mensajes
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
        // Parsea cada línea y filtra los que no hagan match
        const messages = mergedLines
          .map(parseLine)
          .filter((msg) => msg !== null);
        setAllMessages(messages);
      })
      .catch((error) => console.error("Error al leer el archivo:", error));
  }, []);

  // Genera nodos a partir del subconjunto seleccionado (circular) y aplicando el orden y estilo de dibujo
  const generateNodes = useCallback(() => {
    if (!allMessages.length) return;

    // Primero se crea una copia de allMessages y se ordena según orderType
    let sortedMessages = [...allMessages];
    if (orderType === "default") {
      sortedMessages.sort((a, b) => a.message.length - b.message.length);
    } else if (orderType === "date") {
      sortedMessages.sort((a, b) => parseDateTime(a) - parseDateTime(b));
    } else if (orderType === "random") {
      // Shuffle con algoritmo Fisher-Yates
      for (let i = sortedMessages.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sortedMessages[i], sortedMessages[j]] = [sortedMessages[j], sortedMessages[i]];
      }
    }

    // Ahora se seleccionan sampleSize mensajes a partir del startIndex (de forma circular)
    let selected = [];
    for (let i = 0; i < sampleSize; i++) {
      const idx = (startIndex + i) % sortedMessages.length;
      selected.push(sortedMessages[idx]);
    }

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    let newNodes = [];

    if (drawingStyle === "heart") {
      // Modo heart: fórmula clásica del corazón usando scale
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
            x: centerX + xFactor * scale,
            y: centerY - yFactor * scale,
          },
        };
      });
    } else if (drawingStyle === "timeline") {
      // Modo timeline: los nodos se posicionan secuencialmente considerando el ancho del mensaje
      const timelineScale = scale / 75;
      let currentX = 50 * timelineScale;
      const margin = 50 * timelineScale;
      newNodes = [];
      for (let index = 0; index < selected.length; index++) {
        const msg = selected[index];
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
      }
    }

    // Conectar los nodos en secuencia
    const newEdges = [];
    for (let i = 0; i < newNodes.length - 1; i++) {
      newEdges.push({
        id: `e${i}-${i + 1}`,
        source: newNodes[i].id,
        target: newNodes[i + 1].id,
        animated: true,
        style: { stroke: newNodes[i].data.color, strokeWidth: 2 },
      });
    }
    setNodes(newNodes);
    setEdges(newEdges);
  }, [allMessages, startIndex, sampleSize, scale, drawingStyle, orderType]);

  // Actualiza el diagrama cada vez que cambien parámetros
  useEffect(() => {
    generateNodes();
  }, [allMessages, startIndex, sampleSize, scale, drawingStyle, orderType, generateNodes]);

  // Estilos del panel de controles (más pequeño)
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
    width: "180px",
  };

  const labelStyle = {
    fontWeight: "bold",
    color: "black",
    marginBottom: "3px",
  };

  // Nuevo estilo para los inputs range
  const rangeInputStyle = {
    width: "100%",
    padding: "0",
    margin: "0",
    border: "none",

  };

  // Estilo para los selects
  const selectInputStyle = {
    width: "100%",
    padding: "5px",
    borderRadius: "4px",
    border: "1px solid #ccc",
  };

  function filter(node) {
    return node.tagName !== "I";
  }

  // Función de exportación (igual que antes)
  async function exportDiagramSVGAndPNG() {
    try {
      // Espera para que todo se renderice
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
  
      // Clonar el contenedor de React Flow
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
      // Opcionalmente, fijar el tamaño del clon usando scrollWidth/scrollHeight
      clone.style.width = `${element.scrollWidth}px`;
      clone.style.height = `${element.scrollHeight}px`;
      document.body.appendChild(clone);
  
      // Calcular el bounding box de todos los elementos relevantes (nodos y bordes)
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
        // Convertir coordenadas relativas al clon
        const left = rect.left - cloneRect.left;
        const top = rect.top - cloneRect.top;
        const right = left + rect.width;
        const bottom = top + rect.height;
        if (left < minX) minX = left;
        if (top < minY) minY = top;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
      });
  
      // Si no se encuentran elementos (caso borde), usar el tamaño del clon
      if (minX === Infinity) {
        minX = 0;
        minY = 0;
        maxX = clone.offsetWidth;
        maxY = clone.offsetHeight;
      }
  
      // Agregar un margen opcional
      const margin = 20;
      minX -= margin;
      minY -= margin;
      maxX += margin;
      maxY += margin;
      const width = maxX - minX;
      const height = maxY - minY;
  
      // Factor de escala para mejorar la resolución (por ejemplo, 2)
      const scaleFactor = 2;
      const scaledWidth = width * scaleFactor;
      const scaledHeight = height * scaleFactor;
  
      // Ajustar el clon al tamaño escalado
      clone.style.width = `${scaledWidth}px`;
      clone.style.height = `${scaledHeight}px`;
  
      // Trasladar y escalar el viewport del clon para que el bounding box empiece en (0,0)
      const viewport = clone.querySelector(".react-flow__viewport");
      if (viewport) {
        viewport.style.transform = `translate(${
          -minX * scaleFactor
        }px, ${-minY * scaleFactor}px) scale(${scaleFactor})`;
      }
  
      // Generar el SVG (data URL) a partir del clon
      const svgContent = await htmlToImage.toSvg(clone, {
        filter: (node) => node.tagName !== "I",
        width: scaledWidth,
        height: scaledHeight,
      });
      const svgDataUrl = svgContent; // ya incluye el prefijo data:image/svg+xml,...
  
      // Generar el PNG (data URL) a partir del clon, usando pixelRatio para mayor calidad
      const pngDataUrl = await htmlToImage.toPng(clone, {
        filter: (node) => node.tagName !== "I",
        width: scaledWidth,
        height: scaledHeight,
        pixelRatio: scaleFactor,
      });
  
      // Eliminar el clon del DOM
      document.body.removeChild(clone);
  
      // Descargar el SVG
      const svgLink = document.createElement("a");
      svgLink.download = "diagrama.svg";
      svgLink.href = svgDataUrl;
      svgLink.click();
  
      // Descargar el PNG
      const pngLink = document.createElement("a");
      pngLink.download = "diagrama.png";
      pngLink.href = pngDataUrl;
      pngLink.click();
    } catch (error) {
      console.error("Error al exportar el diagrama:", error);
    }
  }
  

  // Si no se requiere autenticación, se omite la pantalla de login
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
          <label style={labelStyle}>Start Index: {startIndex}</label>
          <input
            type="range"
            min="0"
            max={allMessages.length > 0 ? allMessages.length - 1 : 0}
            value={startIndex}
            onChange={(e) => setStartIndex(Number(e.target.value))}
            style={rangeInputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Sample Size: {sampleSize}</label>
          <input
            type="range"
            min="1"
            max={allMessages.length > 0 ? allMessages.length : 1}
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
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
          <Background gap={16} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

export default App;
