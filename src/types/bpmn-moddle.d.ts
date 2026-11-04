declare module 'bpmn-moddle' {
  export class BpmnModdle {
    fromXML(xml: string): Promise<{ rootElement?: unknown; warnings?: { message: string }[] }>;
  }
}
