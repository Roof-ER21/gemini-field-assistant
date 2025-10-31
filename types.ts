// Fix: Defining types used across the application.
export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  sources?: Array<{
    document: {
      name: string;
      path: string;
      category: string;
    };
    content: string;
    score: number;
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
