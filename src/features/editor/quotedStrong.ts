import {InlineContext,type MarkdownConfig} from '@lezer/markdown';

// CommonMark treats a quote as punctuation, so **"text"** between East Asian
// characters misses both flanking checks. Extend only double-asterisk markers
// beside a quote and a CJK letter while using the ordinary emphasis resolver.
const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const opening=/["'“‘「『]/u;
const closing=/["'”’」』]/u;
export const quotedStrong:MarkdownConfig={parseInline:[{
  name:'QuotedStrong',
  before:'Emphasis',
  parse(context,next,from){
    const to=from+2;
    if(next!==42||context.char(from+1)!==42||context.char(from-1)===42||context.char(to)===42)return -1;
    const before=context.slice(from-1,from),after=context.slice(to,to+1);
    const open=cjk.test(before)&&opening.test(after);
    const close=closing.test(before)&&cjk.test(after);
    // Preserve the other direction the original delimiter already supports
    // (for example, a regular **中文** followed immediately by a quote).
    return open||close?context.addDelimiter(InlineContext.emphasisAsterisk,from,to,true,true):-1;
  },
}]};
