import React from 'react';
import { IncidentGraphPayload } from '../types/triage';

interface IncidentGraphViewProps {
  graph: IncidentGraphPayload;
  currentIncidentId: string;
  onSelectIncident: (incidentId: string) => void;
}

export const IncidentGraphView: React.FC<IncidentGraphViewProps> = ({
  graph,
  currentIncidentId,
  onSelectIncident
}) => {
  const { nodes, edges } = graph;

  if (!nodes || nodes.length === 0) {
    return (
      <div className="graph-empty">
        <p>No graph connections found for this ticket.</p>
      </div>
    );
  }

  // Layout calculation: place current incident at center, others arranged in radial/grid layout
  const width = 640;
  const height = 360;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 140;

  const otherNodes = nodes.filter((n) => n.id !== currentIncidentId);

  const nodePositions: Record<string, { x: number; y: number }> = {};
  nodePositions[currentIncidentId] = { x: centerX, y: centerY };

  otherNodes.forEach((node, index) => {
    const angle = (index / (otherNodes.length || 1)) * 2 * Math.PI - Math.PI / 2;
    nodePositions[node.id] = {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    };
  });

  const getPriorityColor = (priority: string) => {
    switch (priority.toUpperCase()) {
      case 'CRITICAL':
      case 'P1_CRITICAL':
        return '#f87171';
      case 'HIGH':
      case 'P2_HIGH':
        return '#fb923c';
      case 'MEDIUM':
      case 'P3_MEDIUM':
        return '#fbbf24';
      default:
        return '#38bdf8';
    }
  };

  const getRelationshipStyle = (relType: string, status: string) => {
    const isProposed = status === 'PROPOSED';
    switch (relType) {
      case 'POSSIBLY_CAUSED_BY':
        return { stroke: '#f43f5e', dash: isProposed ? '5,5' : 'none' };
      case 'FOLLOW_UP_TO':
        return { stroke: '#a855f7', dash: isProposed ? '5,5' : 'none' };
      case 'REOPENED_FROM':
        return { stroke: '#eab308', dash: isProposed ? '5,5' : 'none' };
      default:
        return { stroke: '#64748b', dash: isProposed ? '5,5' : 'none' };
    }
  };

  return (
    <div className="incident-graph-container">
      <div className="graph-header">
        <div className="graph-title">Incident Relationship Graph</div>
        <div className="graph-legend">
          <span className="legend-item"><span className="dot current" /> Current</span>
          <span className="legend-item"><span className="dot confirmed" /> Confirmed Link</span>
          <span className="legend-item"><span className="dot proposed" /> AI Proposed Link</span>
        </div>
      </div>

      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="graph-svg">
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="22"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
          </marker>
        </defs>

        {/* Render Edges */}
        {edges.map((edge) => {
          const sourcePos = nodePositions[edge.source];
          const targetPos = nodePositions[edge.target];
          if (!sourcePos || !targetPos) return null;

          const style = getRelationshipStyle(edge.relationshipType, edge.status);
          const midX = (sourcePos.x + targetPos.x) / 2;
          const midY = (sourcePos.y + targetPos.y) / 2;

          return (
            <g key={edge.id} className="graph-edge-group">
              <line
                x1={sourcePos.x}
                y1={sourcePos.y}
                x2={targetPos.x}
                y2={targetPos.y}
                stroke={style.stroke}
                strokeWidth={edge.status === 'PROPOSED' ? 1.5 : 2.5}
                strokeDasharray={style.dash}
                markerEnd="url(#arrow)"
                className="edge-line"
              />
              <rect
                x={midX - 45}
                y={midY - 10}
                width={90}
                height={20}
                rx={4}
                fill="#0f172a"
                stroke={style.stroke}
                strokeWidth={1}
                opacity={0.9}
              />
              <text
                x={midX}
                y={midY + 3}
                textAnchor="middle"
                fontSize={9}
                fontWeight={600}
                fill="#e2e8f0"
              >
                {edge.relationshipType.replace(/_/g, ' ')}
              </text>
            </g>
          );
        })}

        {/* Render Nodes */}
        {nodes.map((node) => {
          const pos = nodePositions[node.id];
          if (!pos) return null;

          const isCurrent = node.id === currentIncidentId;
          const priorityColor = getPriorityColor(node.priority);

          return (
            <g
              key={node.id}
              className={`graph-node-group ${isCurrent ? 'is-current' : ''}`}
              transform={`translate(${pos.x}, ${pos.y})`}
              onClick={() => onSelectIncident(node.id)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                r={isCurrent ? 28 : 22}
                fill="#1e293b"
                stroke={isCurrent ? '#3b82f6' : priorityColor}
                strokeWidth={isCurrent ? 3 : 2}
                className="node-circle"
              />
              <text
                y={-2}
                textAnchor="middle"
                fontSize={isCurrent ? 11 : 10}
                fontWeight={700}
                fill="#f8fafc"
              >
                {node.ticketNumber}
              </text>
              <text
                y={10}
                textAnchor="middle"
                fontSize={8}
                fill="#94a3b8"
              >
                {node.category}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
