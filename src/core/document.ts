/** Formatunabhängiges Dokument. Renderer lesen nur dieses Modell, nie das BPMN. */
export interface StepRef {
  step: number;
  text: string;
}

export type Inline = string | StepRef | { strong: string };

export type Block =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'heading'; level: number; text: string; anchor?: number }
  | { type: 'step'; anchor: number; content: Inline[] };

export interface ProcessDocument {
  lang: string;
  title: string;
  documentTitle: string;
  overviewHeading: string;
  overview: Block[];
  rolesHeading: string;
  roles: string[];
  messagesHeading: string;
  messages: string[];
  flowHeading: string;
  flow: Block[];
}
