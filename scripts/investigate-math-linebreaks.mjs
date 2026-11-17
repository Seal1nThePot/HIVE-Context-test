import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer as createHttpServer} from 'node:http';
import {createServer} from 'vite';

// Exercise the application's renderer without changing math parsing or options.
// An unbound HTTP server keeps this SSR-only check from opening an HMR port.
const server=await createServer({server:{middlewareMode:true,hmr:{server:createHttpServer()}},appType:'custom'});
try{
  const {renderMath}=await server.ssrLoadModule('/src/features/editor/mathRender.ts');
  const {scanMath,mathSource}=await server.ssrLoadModule('/src/features/editor/mathSyntax.ts');
  const cases=[
    ['plain-source-newline','x=1\ny=2',true,0],
    ['bare-double-backslash',String.raw`x=1 \\ y=2`,true,0],
    ['bare-newline-command',String.raw`x=1 \newline y=2`,true,0],
    ['aligned',String.raw`\begin{aligned}
x &= 1 \\
y &= 2
\end{aligned}`,true,2],
    ['gathered',String.raw`\begin{gathered}
x=1 \\
y=2
\end{gathered}`,true,2],
    ['cases',String.raw`f(x)=\begin{cases}
x^2 & x\ge 0 \\
-x & x<0
\end{cases}`,true,2],
    ['aligned-with-gap',String.raw`\begin{aligned}x&=1\\[6pt]y&=2\end{aligned}`,true,2],
    ['split',String.raw`\begin{split}x&=1\\y&=2\end{split}`,true,2],
    ['align-star',String.raw`\begin{align*}x&=1\\y&=2\end{align*}`,true,2],
    ['multline',String.raw`\begin{multline}x=1\\y=2\end{multline}`,false,0],
  ];
  const results=cases.map(([name,source,expectedOk,expectedRows])=>{
    const result=renderMath(source,true),wrapped='$$\n'+source+'\n$$',scan=scanMath(wrapped);
    const rows=(result.html?.match(/<mtr>/g)||[]).length;
    assert.equal(!!result.html,expectedOk,name+' render status');
    assert.equal(rows,expectedRows,name+' MathML rows');
    assert.equal(scan.math.length,1,name+' Markdown block');
    assert.equal(mathSource(wrapped,true),source,name+' source preservation');
    return {name,source,ok:!!result.html,error:result.error,rows,hasMtable:!!result.html?.includes('<mtable'),hasVisualNewline:!!result.html?.includes('class="mspace newline"'),scanCount:scan.math.length,sourceRoundTrip:true};
  });
  const output='delivery/editor-enhancements-20261118';
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(output+'/latex-investigation.json',JSON.stringify({passed:true,date:'2026-11-18',renderer:'KaTeX 0.19.1 / actual renderMath()',strict:'error',results},null,2)+'\n');
  console.log(JSON.stringify({passed:true,cases:results.length,changedMathRuntime:false}));
}finally{await server.close();}
