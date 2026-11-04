export type Severity = 'warning' | 'info';

export type FindingCode =
  | 'parser-warning'
  | 'broken-flow'
  | 'missing-name'
  | 'unlabeled-exit'
  | 'no-start'
  | 'unreachable'
  | 'dead-end'
  | 'implicit-split'
  | 'unconnected-pool'
  | 'unsupported';

export interface Finding {
  severity: Severity;
  code: FindingCode;
  message: string;
  elementId?: string;
}

export type FatalCode = 'not-bpmn' | 'no-process' | 'too-large';

/** Das Modell lässt sich gar nicht umwandeln. Alle anderen Probleme sind Findings. */
export class ConvertError extends Error {
  readonly code: FatalCode;

  constructor(code: FatalCode, message: string) {
    super(message);
    this.name = 'ConvertError';
    this.code = code;
  }
}
