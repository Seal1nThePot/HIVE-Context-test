export type ComposerKeyAction='ignore'|'newline'|'send';

/** Enter 发送、Shift+Enter 换行、Ctrl/Cmd+Enter 作为发送别名；输入法组合期间一律不发送。 */
export function composerKeyAction(input:{key:string;shiftKey:boolean;ctrlKey:boolean;metaKey:boolean;isComposing:boolean;disabled:boolean;text:string}):ComposerKeyAction{
  if(input.isComposing||input.key!=='Enter')return 'ignore';
  if(input.shiftKey)return 'newline';
  return input.disabled||!input.text.trim()?'ignore':'send';
}
