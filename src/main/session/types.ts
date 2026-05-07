export interface Step {
  id?: string;
  title?: string;
  instruction?: string;
  targetLabel?: string;
  x: number;
  y: number;
  action: 'click' | 'type' | 'scroll' | 'wait';
  typeText?: string;
  delayMs?: number;
  waitForMs?: number;
  narration?: string;
}

export interface Node {
  id: string;
  title: string;
  description: string;
  prerequisites: string[];
  completed: boolean;
  attempts: number;
  avgStepTimeMs: number;
  lastStepIndex: number;
}

export interface Edge {
  from: string;
  to: string;
}

export interface Branch {
  id: string;
  forkedFrom: {
    nodeId: string;
    stepIndex: number;
  };
  nodesCovered: string[];
  status: 'active' | 'completed';
}

export interface Session {
  id: string;
  timestamp: string;
  nodesVisited: string[];
  branchId?: string;
  steps: Step[];
}

export interface BanditState {
  A: [number, number]; // [alpha, beta]
  B: [number, number];
  C: [number, number];
}

export interface LearningGraph {
  userId: string;
  app: string;
  nodes: Record<string, Node>;
  edges: Edge[];
  branches: Record<string, Branch>;
  sessions: Session[];
  bandtState: BanditState;
}
