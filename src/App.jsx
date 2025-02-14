import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactFlow, {
  Handle,
  Position,
  Background,
  Controls,
  ConnectionLineType,
} from 'reactflow';
import * as htmlToImage from 'html-to-image';
import 'reactflow/dist/style.css';
import './App.css';

const SimpleNode = ({ data }) => {
  return (
    <div
      style={{
        border: `2px solid ${data.color}`,
        borderRadius: '4px',
        padding: '8px',
        background: '#fff',
        textAlign: 'left',
        minWidth: '200px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        position: 'relative',
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
          fontSize: '12px',
          color: '#333',
          marginBottom: '4px',
          borderBottom: `1px solid ${data.color}`,
          paddingBottom: '4px',
        }}
      >
        <strong>{data.date}</strong> - <strong>{data.time}</strong>
      </div>
      <div style={{ fontWeight: 'bold', marginBottom: '4px', color: data.color }}>
        {data.sender}
      </div>
      <div style={{ fontSize: '14px', color: '#555' }}>{data.message}</div>
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
  // Guarda todos los mensajes parseados
  const [allMessages, setAllMessages] = useState([]);
  // Nodos y aristas a mostrar
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const reactFlowWrapper = useRef(null);

  // Parámetros configurables
  const [startIndex, setStartIndex] = useState(0);
  const [sampleSize, setSampleSize] = useState(50);
  const [heartScale, setHeartScale] = useState(75); // escala base del corazón

  // Función de espera
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Función para parsear cada línea de mensaje
  const parseLine = (line) => {
    // Formato: "dd/mm/yy a las hh:mm - sender: message"
    const regex = /^\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+a las\s+(\d{1,2}:\d{1,2})\s+-\s+(.*?):\s+(.*?)\s*$/;
    const match = line.match(regex);
    if (match) {
      const [, date, time, sender, message] = match;
      return { date, time, sender, message };
    }
    return null;
  };

  // Carga y parseo de mensajes
  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'resultados.txt')
      .then((res) => res.text())
      .then((text) => {
        const rawLines = text.split('\n');
        const mergedLines = [];
        let currentLine = '';
        const dateStartRegex = /^\s*\d{1,2}\/\d{1,2}\/\d{2,4}/;
        rawLines.forEach((line) => {
          if (dateStartRegex.test(line)) {
            if (currentLine !== '') {
              mergedLines.push(currentLine);
            }
            currentLine = line.trim();
          } else {
            currentLine += ' ' + line.trim();
          }
        });
        if (currentLine !== '') mergedLines.push(currentLine);
        // Parsea cada línea y filtra los que no hagan match
        const messages = mergedLines
          .map(parseLine)
          .filter((msg) => msg !== null);
        // Ordena los mensajes por longitud del mensaje (de menor a mayor)
        messages.sort((a, b) => a.message.length - b.message.length);
        setAllMessages(messages);
      })
      .catch((error) => console.error('Error al leer el archivo:', error));
  }, []);

  // Genera nodos a partir del subconjunto seleccionado (circular)
  const generateNodes = useCallback(() => {
    if (!allMessages.length) return;
    const total = allMessages.length;
    const selected = [];
    for (let i = 0; i < sampleSize; i++) {
      const idx = (startIndex + i) % total;
      selected.push(allMessages[idx]);
    }
    // Calcula la escala en función del sampleSize y el heartScale definido
    const scale = heartScale * (sampleSize / 50);
    // Centra en el viewport: usamos el centro de la ventana
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const count = selected.length;
    const newNodes = selected.map((msg, index) => {
      const t = (index / count) * 2 * Math.PI;
      const x = 16 * Math.pow(Math.sin(t), 3) * scale;
      const y =
        (13 * Math.cos(t) -
          5 * Math.cos(2 * t) -
          2 * Math.cos(3 * t) -
          Math.cos(4 * t)) *
        scale;
      return {
        id: `${index}`,
        type: 'simple',
        data: {
          ...msg,
          color: msg.sender.toLowerCase().includes('andrea') ? '#FF69B4' : '#1E90FF',
        },
        position: { x: centerX + x, y: centerY - y },
      };
    });
    // Conecta los nodos en secuencia
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
  }, [allMessages, startIndex, sampleSize, heartScale]);

  // Actualiza el diagrama cada vez que cambien parámetros
  useEffect(() => {
    generateNodes();
  }, [allMessages, startIndex, sampleSize, heartScale, generateNodes]);

  // Panel de controles con estilo profesional y inputs alineados
  const controlsStyle = {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: '#fff',
    border: '1px solid #ccc',
    padding: '15px',
    borderRadius: '8px',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
    zIndex: 10,
    fontFamily: 'sans-serif',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '200px',
  };

  const labelStyle = {
    fontWeight: 'bold',
    color: 'black',
    marginBottom: '3px',
  };

  const inputStyle = {
    width: '100%',
    padding: '5px',
    borderRadius: '4px',
    border: '1px solid #ccc',
  };

  // Función de exportación (igual que antes)
  async function exportDiagramSVGAndPNG() {
    try {
      await sleep(1000);
      if (reactFlowInstance) {
        reactFlowInstance.setEdges((eds) =>
          eds.map((edge) => {
            edge.animated = false;
            edge.markerEnd = { type: 'arrow', width: 15, height: 15 };
            return edge;
          })
        );
        reactFlowInstance.fitView();
      }
      await sleep(1000);
      const element = reactFlowWrapper.current;
      if (!element) {
        console.error('Contenedor no encontrado');
        return;
      }
      const clone = element.cloneNode(true);
      clone.style.overflow = 'visible';
      clone.style.position = 'absolute';
      clone.style.top = '0px';
      clone.style.left = '0px';
      document.body.appendChild(clone);
      // Calcula el bounding box de los nodos
      const nodeElements = clone.querySelectorAll('.react-flow__node');
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      const cloneRect = clone.getBoundingClientRect();
      nodeElements.forEach((node) => {
        const rect = node.getBoundingClientRect();
        const left = rect.left - cloneRect.left;
        const top = rect.top - cloneRect.top;
        const right = left + rect.width;
        const bottom = top + rect.height;
        if (left < minX) minX = left;
        if (top < minY) minY = top;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
      });
      const margin = 20;
      minX -= margin;
      minY -= margin;
      maxX += margin;
      maxY += margin;
      const width = maxX - minX;
      const height = maxY - minY;
      const viewport = clone.querySelector('.react-flow__viewport');
      if (viewport) {
        viewport.style.transform = `translate(${-minX}px, ${-minY}px)`;
      }
      const svgDataUrl = await htmlToImage.toSvg(clone, {
        filter: (node) => node.tagName !== 'I',
        width: width,
        height: height,
      });
      console.log('SVG Data URL:', svgDataUrl);
      if (!svgDataUrl || svgDataUrl.length === 0) {
        throw new Error('SVG Data URL vacío');
      }
      const scaleFactor = 5;
      const pngDataUrl = await htmlToImage.toPng(clone, {
        filter: (node) => node.tagName !== 'I',
        width: width,
        height: height,
        pixelRatio: scaleFactor,
      });
      document.body.removeChild(clone);
      const svgLink = document.createElement('a');
      svgLink.download = 'diagrama.svg';
      svgLink.href = svgDataUrl;
      svgLink.click();
      const pngLink = document.createElement('a');
      pngLink.download = 'diagrama.png';
      pngLink.href = pngDataUrl;
      pngLink.click();
    } catch (error) {
      console.error('Error al exportar el diagrama:', error);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Panel de controles */}
      <div style={controlsStyle}>
        <div>
          <label style={labelStyle}>Start Index:</label>
          <input
            type="number"
            min="0"
            value={startIndex}
            onChange={(e) => setStartIndex(Number(e.target.value))}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Sample Size:</label>
          <input
            type="number"
            min="1"
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Heart Scale:</label>
          <input
            type="number"
            min="1"
            value={heartScale}
            onChange={(e) => setHeartScale(Number(e.target.value))}
            style={inputStyle}
          />
        </div>
      </div>
      <button onClick={exportDiagramSVGAndPNG} style={{ position: "absolute", zIndex: 999 }}>
        Exportar Diagrama a SVG y PNG (Descargar)
      </button>
      <div
        className="reactflow-wrapper react-flow-exporting"
        ref={reactFlowWrapper}
        style={{ width: '100%', height: '100vh' }}
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
