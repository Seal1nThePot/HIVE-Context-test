import {describe,it,expect} from 'vitest';
import {renderMath} from './mathRender';

describe('local KaTeX rendering and safety budgets',()=>{
  it('produces real HTML and accessible MathML for inline and block LaTeX',()=>{
    const inline=renderMath('E=mc^2',false),block=renderMath('\\sum_{i=1}^n \\frac{i}{2}',true);
    expect(inline.html).toContain('class="katex"');expect(inline.html).toContain('<math');expect(inline.html).toContain('<msup>');
    expect(block.html).toContain('katex-display');expect(block.html).toContain('mfrac');
    expect(renderMath('\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}',true).html).toContain('mtable');
  });
  it('returns explicit source fallback for invalid syntax, recursive macros, depth and source limits',()=>{
    for(const source of ['\\NoSuchCommand{x}','\\def\\a{\\a}\\a','{'.repeat(65)+'x'+'}'.repeat(65),'x'.repeat(4097),'x\n'.repeat(65)])expect(renderMath(source,true).error).toContain('显示源码');
  });
  it('does not create user hyperlinks, images or arbitrary HTML attributes',()=>{
    for(const source of ['\\href{https://example.test}{click}','\\url{https://example.test}','\\includegraphics{https://example.test/a.png}','\\htmlClass{evil}{x}','\\htmlStyle{color:red}{x}','\\href{javascript:alert(1)}{x}']){
      const result=renderMath(source,false);expect(result.error).toBeDefined();expect(result.html).toBeUndefined();
    }
  });
  it('isolates macros per formula and caps user dimensions',()=>{
    expect(renderMath('\\gdef\\private{x}\\private',false).html).toBeDefined();
    expect(renderMath('\\private',false).error).toBeDefined();
    const html=renderMath('\\rule{999999em}{999999em}',false).html!;
    expect(html).toBeDefined();expect(html.replace(/<annotation[\s\S]*?<\/annotation>/g,'')).not.toContain('999999em');expect(html).toContain('20em');
  });
});
