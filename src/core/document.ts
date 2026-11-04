/** Formatunabhängiges Dokument. Renderer lesen nur dieses Modell, nie das BPMN. */
export interface StepRef {
  step: number;
  text: string;
}

export type Inline = string | StepRef | { strong: string };

export interface NumberedItem {
  number: number;
  /** Ziel für Sprünge. Der Hauptweg nennt dieselben Nummern, ist aber kein Sprungziel. */
  anchor: boolean;
  content: Inline[];
}

export type Block =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'list'; items: Inline[][] }
  | { type: 'heading'; level: number; text: string; anchor?: number }
  | { type: 'numbered'; items: NumberedItem[] };

export interface Step {
  number: number;
  heading: string;
  blocks: Block[];
}

export interface FlowSection {
  heading: string;
  blocks: Block[];
  steps: Step[];
}

export interface ProcessDocument {
  lang: string;
  title: string;
  documentTitle: string;
  overview: Block[];
  rolesHeading: string;
  roles: Inline[][];
  messagesHeading: string;
  messages: Inline[][];
  overviewHeading: string;
  sections: FlowSection[];
}
