// Fix: Defining types used across the application.
export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  applied_global?: string[];
  sources?: Array<{
    document: {
      name: string;
      path: string;
      category: string;
    };
    content: string;
    score: number;
  }>;
  state?: string;
  provider?: string;
  session_id?: string;
  created_at?: Date;
  toolResults?: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: unknown;
    success: boolean;
    error?: string;
  }>;
}

export interface GroundingChunk {
  maps?: {
    uri: string;
    title: string;
  };
  web?: {
    uri: string;
    title: string;
  };
}
