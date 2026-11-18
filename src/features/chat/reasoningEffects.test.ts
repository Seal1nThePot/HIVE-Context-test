import {describe,it,expect} from 'vitest';
import {normalizeReasoningEffects} from './reasoningEffects';
import {createTemplateBinding,templateBaseDefaults} from '../theme/templateBinding';
import blue from '../../../templates/claude-mediterranean-blue/colors.json';

describe('reasoning effect template',()=>{
  it('keeps valid per-level customization through template binding and bounds particle cost',()=>{
    const binding=createTemplateBinding({id:'test-blue',name:'test',bases:['black','white']},{...blue,reasoningEffects:{max:{color:'#123456',glow:.8,particles:99,duration:800,easing:'cubic-bezier(.2,1,.3,1)'}}});
    expect(templateBaseDefaults(binding,'white').reasoningEffects?.max).toEqual({color:'#123456',glow:.8,particles:8,duration:800,easing:'cubic-bezier(.2,1,.3,1)'});
  });
  it('rejects unsafe CSS values and limits durations',()=>{
    expect(normalizeReasoningEffects({high:{color:'red; display:none',glow:3,particles:-1,duration:5000,easing:'url(x)'}}).high).toEqual({color:undefined,glow:1,particles:0,duration:2000,easing:'cubic-bezier(.22,1,.36,1)'});
  });
});
