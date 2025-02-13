import React, { useEffect, useRef, useState } from 'react';
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
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const reactFlowWrapper = useRef(null);

  // Carga datos de "resultados.txt" y crea nodos y edges (ejemplo)
  useEffect(() => {
    fetch('/resultados.txt')
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
        if (currentLine !== '') {
          mergedLines.push(currentLine);
        }

        const newNodes = [];
        const count = mergedLines.length;
        mergedLines.forEach((line, index) => {
          const regex = /^\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+a las\s+(\d{1,2}:\d{1,2})\s+-\s+(.*?):\s+(.*?)\s*$/;
          const match = line.match(regex);
          if (match) {
            const [, date, time, sender, message] = match;
            let color = '#1E90FF';
            if (sender.toLowerCase().includes('andrea')) {
              color = '#FF69B4';
            }
            const t = (index / count) * 2 * Math.PI;
            const scale = 1000;
            const offsetX = 800;
            const offsetY = 600;
            const x = 16 * Math.pow(Math.sin(t), 3) * scale;
            const y =
              (13 * Math.cos(t) -
                5 * Math.cos(2 * t) -
                2 * Math.cos(3 * t) -
                Math.cos(4 * t)) *
              scale;

            newNodes.push({
              id: `${index}`,
              type: 'simple',
              data: { date, time, sender, message, color },
              position: { x: offsetX + x, y: offsetY - y },
            });
          } else {
            console.log('No hace match:', line);
          }
        });

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
      })
      .catch((error) => console.error('Error al leer el archivo:', error));
  }, []);

  // Función simple de espera
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Función de filtro para html-to-image
  function filter(node) {
    return node.tagName !== 'I';
  }

  // Exporta TODO el diagrama a SVG (todo el alto y ancho, no solo lo visible)
  async function exportDiagramSVG() {
    try {
      // Espera a que todo se renderice
      await sleep(1000);

      // Opcional: desactiva animaciones de los edges para tener un SVG "estático"
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

      // Clona el contenedor de React Flow para capturar TODO el diagrama
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

      // Calcula el bounding box de todos los nodos en el clon
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

      // Ajusta el clon para que tenga el tamaño del bounding box
      clone.style.width = `${width}px`;
      clone.style.height = `${height}px`;

      // Traslada el contenido (viewport) del clon para que el bounding box empiece en (0,0)
      const viewport = clone.querySelector('.react-flow__viewport');
      if (viewport) {
        viewport.style.transform = `translate(${-minX}px, ${-minY}px)`;
      }

      // Convierte el clon a SVG
      const svgContent = await htmlToImage.toSvg(clone, { filter });
      const svgElement = decodeURIComponent(
        svgContent.replace("data:image/svg+xml;charset=utf-8,", "")
      ).trim();

      // Elimina el clon del DOM
      document.body.removeChild(clone);

      // Abre una nueva ventana y escribe solo el contenido SVG
      const newWindow = window.open('', '_blank');
      if (!newWindow) {
        alert('La ventana emergente fue bloqueada. Permite pop-ups para este sitio.');
        return;
      }
      newWindow.document.open();
      newWindow.document.write(svgElement);
      newWindow.document.close();
    } catch (error) {
      console.error('Error al exportar el diagrama:', error);
    }
  }

  return (
    <div>
      <button onClick={exportDiagramSVG} style={{ margin: '10px' }}>
        Exportar Diagrama a SVG
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
