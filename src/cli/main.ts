import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { ConvertError, convertBpmn, renderHtml, type Finding } from '../core/index.ts';

const USAGE = `Aufruf: npm run convert -- <modell.bpmn> [-o <ausgabe.html oder ausgabe.docx>]

Wandelt ein BPMN-2.0-Modell in ein barrierefreies Dokument um.
Ohne -o entsteht eine HTML-Datei neben dem Modell.
Endet die Ausgabe auf .docx, entsteht ein Word-Dokument.`;

const SEVERITY_LABEL: Record<Finding['severity'], string> = { warning: 'Warnung', info: 'Hinweis' };

function main(args: string[]): number {
  const positional: string[] = [];
  let output: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === '-h' || arg === '--help') {
      console.log(USAGE);
      return 0;
    }
    if (arg === '-o' || arg === '--output') output = args[++index];
    else positional.push(arg);
  }
  const input = positional[0];
  if (!input || positional.length > 1 || (args.includes('-o') && !output)) {
    console.error(USAGE);
    return 2;
  }
  output ??= `${input.slice(0, input.length - extname(input).length)}.html`;

  let bytes: Uint8Array;
  try {
    bytes = readFileSync(input);
  } catch {
    console.error(`Die Datei ${input} lässt sich nicht lesen.`);
    return 1;
  }

  const target = output;
  convertBpmn(bytes, { fallbackTitle: basename(input, extname(input)) }).then(
    async ({ document, findings }) => {
      if (extname(target).toLowerCase() === '.docx') {
        const { renderDocx } = await import('../core/render-docx.ts');
        writeFileSync(target, await renderDocx(document));
      } else {
        writeFileSync(target, renderHtml(document));
      }
      console.log(`${target} geschrieben.`);
      if (findings.length) {
        console.error(`\nPrüfbericht (${findings.length}):`);
        for (const finding of findings) console.error(`- ${SEVERITY_LABEL[finding.severity]}: ${finding.message}`);
      } else {
        console.log('Prüfbericht: keine Befunde.');
      }
    },
    (error: unknown) => {
      console.error(error instanceof ConvertError ? error.message : `Unerwarteter Fehler: ${String(error)}`);
      process.exitCode = 1;
    },
  );
  return 0;
}

process.exitCode = main(process.argv.slice(2));
