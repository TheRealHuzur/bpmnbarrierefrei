import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { ConvertError, convertBpmn, renderHtml, type Finding } from '../core/index.ts';

const USAGE = `Aufruf: npm run convert -- <modell.bpmn> [-o <ausgabe.html>] [--fassung a|b]

Wandelt ein BPMN-2.0-Modell in ein barrierefreies HTML-Dokument um.
Ohne -o entsteht die HTML-Datei neben dem Modell.
Fassung a ist je Pool eine flache Schrittliste, Fassung b ein chronologischer Ablauf über alle Beteiligten.`;

const SEVERITY_LABEL: Record<Finding['severity'], string> = { warning: 'Warnung', info: 'Hinweis' };

function main(args: string[]): number {
  const positional: string[] = [];
  let output: string | undefined;
  let form: string | undefined = 'a';
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === '-h' || arg === '--help') {
      console.log(USAGE);
      return 0;
    }
    if (arg === '-o' || arg === '--output') output = args[++index];
    else if (arg === '--fassung') form = args[++index];
    else positional.push(arg);
  }
  const input = positional[0];
  if (!input || positional.length > 1 || (args.includes('-o') && !output) || (form !== 'a' && form !== 'b')) {
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

  convertBpmn(bytes, { fallbackTitle: basename(input, extname(input)), form }).then(
    ({ document, findings }) => {
      writeFileSync(output, renderHtml(document));
      console.log(`${output} geschrieben.`);
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
