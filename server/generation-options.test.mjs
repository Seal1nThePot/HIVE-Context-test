import {describe,it,expect} from 'vitest';
import {generationPayload} from './generation-options.mjs';

const route=modelConfig=>({model:'m',modelConfig});
describe('image input guard',()=>{
  it('rejects image parts for a text-only model before contacting the upstream',()=>{
    expect(()=>generationPayload(route({id:'m',name:'m'}),{messages:[{role:'user',content:[{type:'text',text:'看图'},{type:'image_url',image_url:{url:'data:image/png;base64,AA=='}}]}]})).toThrow('未声明图片输入');
  });
  it('passes image parts through once the model declares image input',()=>{
    const {payload}=generationPayload(route({id:'m',name:'m',inputTypes:['text','image']}),{messages:[{role:'user',content:[{type:'text',text:'看图'},{type:'image_url',image_url:{url:'data:image/png;base64,AA=='}}]}]});
    expect(payload.messages[0].content).toHaveLength(2);
  });
  it('still rejects malformed parts and images written as plain URLs',()=>{
    const model={id:'m',name:'m',inputTypes:['text','image']};
    expect(()=>generationPayload(route(model),{messages:[{role:'user',content:[{type:'image_url',image_url:{url:'https://example.com/a.png'}}]}]})).toThrow('上下文格式无效');
    expect(()=>generationPayload(route(model),{messages:[{role:'assistant',content:[{type:'text',text:'x'}]}]})).toThrow('上下文格式无效');
  });
});
