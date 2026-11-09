import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const normalize = text => text.replace(/\s+/g, ' ').trim();
const visibleNames = /^(?:label|title|description|placeholder|alt|aria-label|aria-description|aria-valuetext|emptyText|helperText|heading|message|text|lead|body)$/;
const translateCall = node => ts.isCallExpression(node) && /^(?:t|translate)$/.test(node.expression.getText());
export function scanSource(source, filename = 'source.tsx') {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings = [], keys = [];
  const add = (node, text, kind) => {
    text = normalize(text);
    if (!/[\p{L}]/u.test(text)) return;
    const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
    if (!findings.some(x => x.line === line + 1 && x.column === character + 1)) findings.push({ file: filename, line: line + 1, column: character + 1, text, kind });
  };
  function visibleExpression(node) {
    if (!node || translateCall(node)) return;
    if (ts.isStringLiteralLike(node)) add(node, node.text, 'visible expression');
    else if (ts.isConditionalExpression(node)) { visibleExpression(node.whenTrue); visibleExpression(node.whenFalse); }
    else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken,ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.PlusToken].includes(node.operatorToken.kind)) { if (node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) visibleExpression(node.left); visibleExpression(node.right); }
    else if (ts.isTemplateExpression(node)) { add(node.head, node.head.text, 'visible template'); for (const span of node.templateSpans) { visibleExpression(span.expression); add(span.literal, span.literal.text, 'visible template'); } }
    else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) visibleExpression(node.expression);
  }
  function translationKeys(node) {
    if (ts.isStringLiteralLike(node)) keys.push({ key: node.text, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 });
    else if (ts.isConditionalExpression(node)) { translationKeys(node.whenTrue); translationKeys(node.whenFalse); }
    else if (ts.isParenthesizedExpression(node)) translationKeys(node.expression);
  }
  function storesTranslation(node) {
    if (!node) return false;
    if (translateCall(node)) return true;
    if (ts.isConditionalExpression(node)) return storesTranslation(node.whenTrue) || storesTranslation(node.whenFalse);
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(node.operatorToken.kind)) return false;
    return ts.forEachChild(node, storesTranslation) || false;
  }
  function walk(node) {
    if (ts.isJsxText(node)) add(node, node.text, 'JSX text');
    if (ts.isJsxAttribute(node) && visibleNames.test(node.name.getText(file)) && node.initializer) {
      visibleExpression(ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer);
    }
    if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) visibleExpression(node.expression);
    if (ts.isPropertyAssignment(node) && visibleNames.test(node.name.getText(file).replace(/^['"]|['"]$/g,''))) visibleExpression(node.initializer);
    if (ts.isConditionalExpression(node) && /\b(?:locale|language|lang)\b/.test(node.condition.getText(file))) {
      let parent=node.parent; while (parent && !ts.isJsxAttribute(parent) && !ts.isCallExpression(parent)) parent=parent.parent;
      const technicalAttribute=parent && ts.isJsxAttribute(parent) && !visibleNames.test(parent.name.getText(file));
      const languageCodes=[node.whenTrue,node.whenFalse].every(n=>ts.isStringLiteralLike(n) && /^(en|es)(-[A-Z]{2})?$/.test(n.text));
      if (!technicalAttribute && !languageCodes) { visibleExpression(node.whenTrue); visibleExpression(node.whenFalse); }
    }
    if (ts.isCallExpression(node)) {
      if (translateCall(node) && node.arguments[0]) translationKeys(node.arguments[0]);
      if (/^(?:(?:(?:window|globalThis)\.)?(?:alert|confirm)|setError|setMessage|setNotice|setSuccess|setToast)$/.test(node.expression.getText(file))) visibleExpression(node.arguments[0]);
      if (/^set[A-Z][A-Za-z]*$/.test(node.expression.getText(file)) && storesTranslation(node.arguments[0])) add(node, node.getText(file), 'translated copy stored in state (store keys/data and translate at render)');
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left) && /^(title|alt|textContent|innerText)$/.test(node.left.name.text)) visibleExpression(node.right);
    ts.forEachChild(node, walk);
  }
  walk(file); return { findings, keys };
}
export function dictionaryProblems(en, es, name = 'main') {
  const errors = [];
  const placeholders = text => [...String(text).matchAll(/\{([\w]+)\}/g)].map(m=>m[1]).sort().join(',');
  for (const key of new Set([...Object.keys(en), ...Object.keys(es)])) {
    if (!(key in en) || !(key in es)) errors.push(`${name}: missing ${key} in ${key in en ? 'ES' : 'EN'}`);
    else if (typeof en[key] !== 'string' || typeof es[key] !== 'string') errors.push(`${name}: non-string ${key}`);
    else if (!String(en[key]).trim() || !String(es[key]).trim()) errors.push(`${name}: empty ${key}`);
    else if (placeholders(en[key]) !== placeholders(es[key])) errors.push(`${name}: interpolation mismatch ${key}`);
  }
  return errors;
}
function readModule(filename) {
  const source = fs.readFileSync(path.join(root, filename), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {}; new Function('exports', output)(exports); return exports;
}
function files(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):/\.tsx?$/.test(entry.name)?[path.join(dir,entry.name)]:[]); }
export function audit() {
  const {en} = readModule('src/locales/en.ts'), {es} = readModule('src/locales/es.ts');
  const {supportText} = readModule('src/locales/support.ts');
  const {labelText} = readModule('src/locales/label.ts');
  const maintenance=readModule('src/lib/maintenanceMessages.ts');
  const problems = [...dictionaryProblems(en,es), ...dictionaryProblems(supportText.en,supportText.es,'support'), ...dictionaryProblems(labelText.en,labelText.es,'label'), ...dictionaryProblems(maintenance.MAINTENANCE_LABELS.en,maintenance.MAINTENANCE_LABELS.es,'maintenance labels')];
  for (const name of ['MAINTENANCE_TASK_NAMES','MAINTENANCE_ERROR_MESSAGES']) for (const [key, pair] of Object.entries(maintenance[name])) problems.push(...dictionaryProblems({[key]:pair.en},{[key]:pair.es},name));
  for (const filename of ['src/locales/en.ts','src/locales/es.ts','src/locales/support.ts','src/locales/label.ts']) {
    const file=ts.createSourceFile(filename,fs.readFileSync(path.join(root,filename),'utf8'),ts.ScriptTarget.Latest,true);
    function duplicates(node) {
      if (ts.isObjectLiteralExpression(node)) {
        const seen=new Set();
        for (const p of node.properties) if (ts.isPropertyAssignment(p)) {const key=p.name.getText(file).replace(/^['"]|['"]$/g,''); if(seen.has(key)) problems.push(`${filename}: duplicate ${key}`); seen.add(key);}
      }
      ts.forEachChild(node,duplicates);
    }
    duplicates(file);
  }
  const sharedValues=JSON.parse(fs.readFileSync(path.join(root,'scripts/i18n-shared-values.json'),'utf8'));
  for (const [key,value] of Object.entries(en)) {
    if (value===es[key] && /[a-z]{3}/i.test(value) && !sharedValues.some(e=>e.key===key&&e.value===value&&e.reason?.trim())) problems.push(`main: identical EN/ES copy needs translation or a documented technical-name exception: ${key}`);
  }
  for (const entry of sharedValues) if (en[entry.key]!==entry.value || es[entry.key]!==entry.value) problems.push(`Stale shared-value exception: ${entry.key}`);
  const exceptions = JSON.parse(fs.readFileSync(path.join(root,'scripts/i18n-exceptions.json'),'utf8'));
  const unused = new Set(exceptions.map((_,i)=>i));
  const findings = []; let count = 0;
  for (const absolute of files(path.join(root,'src'))) {
    const filename=path.relative(root,absolute);
    if (filename.startsWith('src/locales/')) continue;
    // Existing bilingual catalogue shared verbatim with the maintenance email.
    if (filename === 'src/lib/maintenanceMessages.ts') continue;
    count++;
    const result=scanSource(fs.readFileSync(absolute,'utf8'),filename);
    for (const finding of result.findings) {
      const i=exceptions.findIndex(e=>e.file===filename && e.text===finding.text && e.reason?.trim());
      if(i<0) findings.push(finding); else unused.delete(i);
    }
    for (const {key,line} of result.keys) if (!(key in en) || !(key in es)) problems.push(`${filename}:${line}: missing translation ${key}`);
  }
  // Resolve finite TypeScript unions in interpolated keys, including imported
  // status contracts. Open-ended server strings are reviewed at their fallback.
  const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile);
  const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
  const program=ts.createProgram(parsed.fileNames,parsed.options),checker=program.getTypeChecker();
  function literals(type) {
    if (type.isUnion()) { const parts=type.types.map(literals); return parts.every(Boolean)?parts.flat():null; }
    return type.isStringLiteral() || type.isNumberLiteral() ? [String(type.value)] : null;
  }
  for (const file of program.getSourceFiles()) {
    if (!file.fileName.startsWith(path.join(root,'src')) || file.fileName.includes('/locales/')) continue;
    function visibleAlias(node, seen=new Set()) {
      if (!node || translateCall(node) || seen.has(node)) return;
      seen.add(node);
      if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
        const symbol=checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node)?node.name:node);
        const declaration=symbol?.valueDeclaration;
        if (declaration && (ts.isVariableDeclaration(declaration) || ts.isPropertyAssignment(declaration))) {
          const source=declaration.getSourceFile();
          if(source===file) visibleAlias(declaration.initializer,seen);
        }
      } else if (ts.isStringLiteralLike(node)) {
        const text=normalize(node.text); if (!/[\p{L}]/u.test(text)) return;
        const filename=path.relative(root,file.fileName),pos=file.getLineAndCharacterOfPosition(node.getStart(file));
        const i=exceptions.findIndex(e=>e.file===filename&&e.text===text&&e.reason?.trim());
        if(i>=0) unused.delete(i);
        else if(!findings.some(f=>f.file===filename&&f.line===pos.line+1&&f.column===pos.character+1)) findings.push({file:filename,line:pos.line+1,column:pos.character+1,text,kind:'visible alias'});
      } else if (ts.isConditionalExpression(node)) {visibleAlias(node.whenTrue,seen);visibleAlias(node.whenFalse,seen);}
      else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) visibleAlias(node.expression,seen);
    }
    function dynamic(node) {
      if (ts.isJsxExpression(node) && node.expression && (ts.isIdentifier(node.expression) || ts.isPropertyAccessExpression(node.expression))) {
        const parent=node.parent;
        if (ts.isJsxElement(parent)||ts.isJsxFragment(parent)||(ts.isJsxAttribute(parent)&&visibleNames.test(parent.name.getText(file)))) visibleAlias(node.expression);
      }
      if (ts.isCallExpression(node) && node.expression.getText(file)==='t' && node.arguments[0] && ts.isTemplateExpression(node.arguments[0])) {
        const template=node.arguments[0]; let keys=[template.head.text];
        for (const span of template.templateSpans) {
          const values=literals(checker.getTypeAtLocation(span.expression));
          if (!values || keys.length*values.length>500) {keys=[];break;}
          keys=keys.flatMap(prefix=>values.map(value=>prefix+value+span.literal.text));
        }
        for (const key of keys) if (!(key in en) || !(key in es)) problems.push(`${path.relative(root,file.fileName)}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line+1}: missing dynamic translation ${key}`);
      }
      ts.forEachChild(node,dynamic);
    }
    dynamic(file);
  }
  for (const i of unused) problems.push(`Stale i18n exception: ${exceptions[i].file} ${JSON.stringify(exceptions[i].text)}`);
  return {problems,findings,files:count,keys:Object.keys(en).length};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result=audit();
  if(process.argv.includes('--json')) console.log(JSON.stringify(result,null,2));
  else { for(const p of result.problems) console.error(p); for(const f of result.findings) console.error(`${f.file}:${f.line}:${f.column}: ${f.kind}: ${JSON.stringify(f.text)}`); console.log(`i18n: ${result.keys} keys, ${result.files} source files, ${result.problems.length} dictionary issues, ${result.findings.length} UI literals`); }
  if(result.problems.length || result.findings.length) process.exitCode=1;
}
