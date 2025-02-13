import React, { useEffect, useState } from 'react';
import ReactFlow, {
  Handle, Position,
  Background,
  Controls,
  Node,
  Edge,
  NodeProps,
  ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './App.css';

// Nodo custom "simple" con formato separado para fecha/hora y mensaje
const SimpleNode = ({ data }: NodeProps) => {
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
      {/* Handle de entrada (target) en el lado izquierdo */}
      <Handle
        type="target"
        position={Position.Left}
        id="a"
        style={{ opacity: 0, height: 0, width: 0 }}
      />

      {/* Cabecera con fecha y hora */}
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

      {/* Autor */}
      <div
        style={{
          fontWeight: 'bold',
          marginBottom: '4px',
          color: data.color,
        }}
      >
        {data.sender}
      </div>

      {/* Mensaje */}
      <div style={{ fontSize: '14px', color: '#555' }}>{data.message}</div>

      {/* Handle de salida (source) en el lado derecho */}
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
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    fetch('/resultados.txt')
      .then((res) => res.text())
      .then((text) => {
        // Separa el contenido en líneas
        const rawLines = text.split('\n');
        const mergedLines: string[] = [];
        let currentLine = '';

        // Regex para detectar si la línea comienza con una fecha (por ejemplo, "14/5/24")
        const dateStartRegex = /^\s*\d{1,2}\/\d{1,2}\/\d{2,4}/;

        rawLines.forEach((line) => {
          if (dateStartRegex.test(line)) {
            // Si ya hay contenido en currentLine, lo guardamos
            if (currentLine !== '') {
              mergedLines.push(currentLine);
            }
            // Iniciamos una nueva entrada
            currentLine = line.trim();
          } else {
            // Si la línea no comienza con fecha, es parte del mensaje anterior
            currentLine += ' ' + line.trim();
          }
        });
        // Agrega la última entrada si existe
        if (currentLine !== '') {
          mergedLines.push(currentLine);
        }

        // Ahora procesamos cada línea completa usando una regex flexible
        const newNodes: Node[] = [];
        const count = mergedLines.length;

        mergedLines.forEach((line, index) => {
          // Regex flexible: permite espacios adicionales al inicio y final
          const regex = /^\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+a las\s+(\d{1,2}:\d{1,2})\s+-\s+(.*?):\s+(.*?)\s*$/;
          const match = line.match(regex);
          if (match) {
            const [ , date, time, sender, message ] = match;
            // Asigna color según el autor: rosa para Andrea, azul para David (por defecto)
            let color = '#1E90FF'; // azul para David
            if (sender.toLowerCase().includes('andrea')) {
              color = '#FF69B4'; // rosa para Andrea
            }

            // Calcula el parámetro t para distribuir los nodos en la curva del corazón
            const t = (index / count) * 2 * Math.PI;
            // Ajusta scale para que el corazón sea mucho más grande
            const scale = 1000;      // Aumenta este valor para un corazón mayor
            // Usa los valores del viewport o define offsets fijos
            const offsetX = 800;   // Desplazamiento horizontal para centrar
            const offsetY = 600;   // Desplazamiento vertical

            // Ecuaciones paramétricas del corazón
            const x = 16 * Math.pow(Math.sin(t), 3) * scale;
            const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * scale;

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

        // Conecta los nodos en secuencia para formar el "árbol" del corazón
        const newEdges: Edge[] = [];
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
        console.log(newNodes, newEdges);
      })
      .catch((error) => console.error('Error al leer el archivo:', error));
  }, []);

  return (
    <div className="reactflow-wrapper">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
      >
        <Background gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export default App;
